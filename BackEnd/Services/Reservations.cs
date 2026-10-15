using BackEnd.Contracts;
using BackEnd.Data;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
namespace BackEnd.Services;

public class AppError(string message, int status = 400) : Exception(message) { public int Status { get; } = status; }
public static class Rules
{
    public static int UserId(ClaimsPrincipal u) => int.Parse(u.FindFirstValue(ClaimTypes.NameIdentifier)!);
    public static void Check(bool valid, string message, int status = 400) { if (!valid) throw new AppError(message, status); }
    public static string Text(string? value, int max, string field)
    { Check(!string.IsNullOrWhiteSpace(value) && value.Trim().Length <= max, $"Revisa {field} (máximo {max} caracteres)."); return value!.Trim(); }
    public static void Money(decimal value) => Check(value >= 0 && value <= 9999999 && decimal.Round(value, 2) == value, "El precio debe ser positivo y tener hasta dos decimales.");
    public static async Task<Shop> OwnedShop(AppDb db, int id, ClaimsPrincipal user)
    { var s = await db.Shops.FindAsync(id) ?? throw new AppError("Barbería no encontrada.", 404); Check(s.OwnerId == UserId(user), "No tienes acceso a esta barbería.", 403); return s; }
    public static async Task<Barber> OwnedBarber(AppDb db, int id, ClaimsPrincipal user)
    { var b = await db.Barbers.FindAsync(id) ?? throw new AppError("Barbero no encontrado.", 404); await OwnedShop(db, b.ShopId, user); return b; }
    public static Task<Barber> LockBarber(AppDb db, int id) => db.Barbers.FromSqlInterpolated($"SELECT * FROM `Barbers` WHERE `Id` = {id} FOR UPDATE").SingleAsync();
    public static TimeZoneInfo Zone(string id)
    { try { return TimeZoneInfo.FindSystemTimeZoneById(id); } catch { throw new AppError("Zona horaria no válida. Usa un identificador como America/Merida."); } }
    public static bool InSchedule(DateTime startUtc, DateTime endUtc, TimeZoneInfo zone, IEnumerable<WorkPeriod> periods)
    {
        var start = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(startUtc, DateTimeKind.Utc), zone);
        var end = TimeZoneInfo.ConvertTimeFromUtc(DateTime.SpecifyKind(endUtc, DateTimeKind.Utc), zone);
        return start.Date == end.Date && periods.Any(p => p.Day == (int)start.DayOfWeek && start.TimeOfDay.TotalMinutes >= p.StartMinute && end.TimeOfDay.TotalMinutes <= p.EndMinute);
    }
    public static bool Overlaps(DateTime a, DateTime b, DateTime c, DateTime d) => a < d && b > c;
}
public class Reservations(AppDb db)
{
    public async Task<Booking> Create(BookingRequest req, int customerId)
    {
        Rules.Check(req.Items != null && req.Items.Count <= 30 && req.Items.All(x => x != null), "Revisa los productos.");
        Rules.Check(req.Start.Offset == TimeSpan.Zero || req.Start.Offset.TotalHours is >= -14 and <= 14, "Hora no válida.");
        var start = req.Start.UtcDateTime;
        Rules.Check(start > DateTime.UtcNow && start < DateTime.UtcNow.AddDays(180), "Reserva entre ahora y los próximos 180 días.");
        Rules.Check(start.Second == 0 && start.Millisecond == 0, "Elige una hora sin segundos.");
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
        var preliminary = await db.Offerings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == req.OfferingId)
            ?? throw new AppError("Servicio no encontrado.", 404);
        var barber = await Rules.LockBarber(db, preliminary.BarberId);
        var offer = await db.Offerings.Include(x => x.Haircut).SingleAsync(x => x.Id == req.OfferingId);
        var shop = await db.Shops.Include(x => x.Owner).SingleAsync(x => x.Id == barber.ShopId);
        Rules.Check(barber.Active && offer.Active && offer.Haircut.Active, "El servicio ya no está disponible.");
        var end = start.AddMinutes(offer.Minutes);
        var periods = await db.WorkPeriods.Where(x => x.BarberId == barber.Id).ToListAsync();
        Rules.Check(Rules.InSchedule(start, end, Rules.Zone(shop.TimeZone), periods), "La cita queda fuera del horario de trabajo.");
        Rules.Check(!await db.Blocks.AnyAsync(x => x.BarberId == barber.Id && x.StartUtc < end && x.EndUtc > start), "El barbero tiene un descanso o bloqueo en ese horario.", 409);
        Rules.Check(!await db.Bookings.AnyAsync(x => x.BarberId == barber.Id && x.Status != "Cancelled" && x.StartUtc < end && x.EndUtc > start), "Ese horario acaba de ocuparse. Elige otro.", 409);
        var booking = new Booking { CustomerId = customerId, BarberId = barber.Id, StartUtc = start, EndUtc = end, HaircutName = offer.Haircut.Name, ServicePrice = offer.Price, Total = offer.Price };
        Rules.Check(req.Items!.Select(x => x.ProductId).Distinct().Count() == req.Items!.Count, "No repitas productos.");
        // Consistent lock ordering prevents overselling across different barbers.
        foreach (var item in req.Items!.OrderBy(x => x.ProductId))
        {
            Rules.Check(item.Quantity is > 0 and <= 100, "Cantidad de producto no válida.");
            var product = await db.Products.FromSqlInterpolated($"SELECT * FROM `Products` WHERE `Id` = {item.ProductId} FOR UPDATE").SingleOrDefaultAsync()
                ?? throw new AppError("Producto no encontrado.", 404);
            Rules.Check(product.ShopId == shop.Id && product.Active && product.Stock >= item.Quantity, "Producto no disponible o sin existencias suficientes.", 409);
            product.Stock -= item.Quantity;
            booking.Items.Add(new BookingItem { ProductId = product.Id, Name = product.Name, Quantity = item.Quantity, UnitPrice = product.Price });
            booking.Total += product.Price * item.Quantity;
        }
        Rules.Check(booking.Total <= 99999999.99m, "El total supera el máximo permitido por reserva.");
        db.Bookings.Add(booking);
        var customer = await db.Users.FindAsync(customerId);
        var local = TimeZoneInfo.ConvertTimeFromUtc(start, Rules.Zone(shop.TimeZone));
        db.MailJobs.Add(new MailJob { Recipient = shop.Owner.Email, Subject = $"Nueva cita en {shop.Name}", Body = $"Cliente: {customer!.Name}\nBarbero: {barber.Name}\nFecha: {local:yyyy-MM-dd HH:mm} ({shop.TimeZone})\nCorte: {booking.HaircutName}\nProductos: {string.Join(", ", booking.Items.Select(x => $"{x.Name} x{x.Quantity}"))}\nTotal: ${booking.Total:0.00} MXN", NextAttemptUtc = DateTime.UtcNow });
        await db.SaveChangesAsync();
        await tx.CommitAsync();
        return booking;
    }
    public async Task ChangeStatus(int id, string status, ClaimsPrincipal user)
    {
        await using var tx = await db.Database.BeginTransactionAsync(System.Data.IsolationLevel.ReadCommitted);
        var preliminary = await db.Bookings.AsNoTracking().SingleOrDefaultAsync(x => x.Id == id) ?? throw new AppError("Cita no encontrada.", 404);
        await Rules.LockBarber(db, preliminary.BarberId);
        var b = await db.Bookings.Include(x => x.Items).Include(x => x.Barber).ThenInclude(x => x.Shop).SingleAsync(x => x.Id == id);
        var owner = b.Barber.Shop.OwnerId == Rules.UserId(user);
        Rules.Check(owner || b.CustomerId == Rules.UserId(user), "No tienes acceso a esta cita.", 403);
        Rules.Check(owner || status == "Cancelled", "Solo puedes cancelar tu cita.", 403);
        Rules.Check(b.Status is "Pending" or "Confirmed", "La cita ya está cerrada.", 409);
        Rules.Check(status == "Cancelled" || owner && (status == "Confirmed" && b.Status == "Pending" || status == "Completed" && b.Status == "Confirmed" && b.EndUtc <= DateTime.UtcNow), "Cambio de estado no permitido.");
        Rules.Check(owner || b.StartUtc > DateTime.UtcNow, "Ya no puedes cancelar una cita que comenzó.");
        if (status == "Cancelled")
            foreach (var item in b.Items.OrderBy(x => x.ProductId))
            {
                var p = await db.Products.FromSqlInterpolated($"SELECT * FROM `Products` WHERE `Id` = {item.ProductId} FOR UPDATE").SingleAsync();
                p.Stock += item.Quantity;
            }
        b.Status = status;
        await db.SaveChangesAsync();
        await tx.CommitAsync();
    }
}
