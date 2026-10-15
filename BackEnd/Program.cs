using System.Net.Mail;
using System.Security.Claims;
using System.Threading.RateLimiting;
using BackEnd.Data;
using BackEnd.Contracts;
using BackEnd.Services;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;

var builder = WebApplication.CreateBuilder(args);
var connection = builder.Configuration.GetConnectionString("Database")
    ?? throw new InvalidOperationException("Configura ConnectionStrings__Database (ver README.md).");
builder.Services.AddDbContext<AppDb>(o => o.UseMySql(connection, ServerVersion.AutoDetect(connection)));
builder.Services.AddScoped<Reservations>();
builder.Services.AddHostedService<MailWorker>();
builder.Services.AddAntiforgery(o => o.HeaderName = "X-CSRF-TOKEN");
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(o =>
{
    o.Cookie.Name = "gestor.session"; o.Cookie.HttpOnly = true; o.Cookie.SameSite = SameSiteMode.Lax;
    o.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
    o.ExpireTimeSpan = TimeSpan.FromHours(12);
    o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization();
builder.Services.AddRateLimiter(o => o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
    ctx.Connection.RemoteIpAddress?.ToString() ?? "local", _ => new FixedWindowRateLimiterOptions { PermitLimit = 15, Window = TimeSpan.FromMinutes(1) })));
builder.Services.AddEndpointsApiExplorer(); builder.Services.AddSwaggerGen();
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase);
var app = builder.Build();
app.UseAuthentication();
app.Use(async (ctx, next) =>
{
    try
    {
        if (ctx.Request.Path.StartsWithSegments("/api")) ctx.Response.Headers.CacheControl = "no-store";
        if (ctx.Request.Path.StartsWithSegments("/api") && !HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method))
            await ctx.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(ctx);
        await next();
    }
    catch (AntiforgeryValidationException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { message = "La sesión del formulario caducó. Recarga la página." }); }
    catch (BadHttpRequestException) { ctx.Response.StatusCode = 400; await ctx.Response.WriteAsJsonAsync(new { message = "Revisa los datos de la solicitud." }); }
    catch (AppError ex) { ctx.Response.StatusCode = ex.Status; await ctx.Response.WriteAsJsonAsync(new { message = ex.Message }); }
    catch (DbUpdateException ex) when (ex.InnerException is MySqlException { Number: 1062 })
    { ctx.Response.StatusCode = 409; await ctx.Response.WriteAsJsonAsync(new { message = "Ese correo o registro ya existe." }); }
    catch (Exception ex)
    { app.Logger.LogError(ex, "Error de solicitud {Path}", ctx.Request.Path); ctx.Response.StatusCode = 500; await ctx.Response.WriteAsJsonAsync(new { message = "No se pudo completar la solicitud. Inténtalo de nuevo." }); }
});
app.UseDefaultFiles(); app.UseStaticFiles();
app.UseAuthorization(); app.UseRateLimiter();
if (app.Environment.IsDevelopment()) { app.UseSwagger(); app.UseSwaggerUI(); }
app.MapGet("/api/auth/token", (HttpContext ctx, IAntiforgery csrf) => Results.Ok(new { token = csrf.GetAndStoreTokens(ctx).RequestToken }));
app.MapGet("/api/auth/me", (ClaimsPrincipal u) => Results.Ok(u.Identity?.IsAuthenticated == true ? new { id = Rules.UserId(u), name = u.Identity.Name, role = u.FindFirstValue(ClaimTypes.Role) } : null));
async Task SignIn(HttpContext ctx, User user) => await ctx.SignInAsync(new ClaimsPrincipal(new ClaimsIdentity([
    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()), new Claim(ClaimTypes.Name, user.Name), new Claim(ClaimTypes.Role, user.Role)
], CookieAuthenticationDefaults.AuthenticationScheme)));
app.MapPost("/api/auth/register", async (RegisterRequest r, AppDb db, HttpContext ctx) =>
{
    var name = Rules.Text(r.Name, 120, "el nombre"); var email = Rules.Text(r.Email, 254, "el correo").ToLowerInvariant();
    Rules.Check(MailAddress.TryCreate(email, out var addr) && addr.Address == email, "Correo no válido.");
    Rules.Check(r.Password?.Length is >= 10 and <= 128, "Usa una contraseña de 10 a 128 caracteres.");
    Rules.Check(r.Role is "Client" or "Barber", "Tipo de cuenta no válido.");
    var user = new User { Name = name, Email = email, Role = r.Role };
    user.PasswordHash = new PasswordHasher<User>().HashPassword(user, r.Password!);
    db.Users.Add(user); await db.SaveChangesAsync(); await SignIn(ctx, user);
    return Results.Ok(new { user.Id, user.Name, user.Role });
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/login", async (LoginRequest r, AppDb db, HttpContext ctx) =>
{
    Rules.Check(!string.IsNullOrWhiteSpace(r.Email) && r.Email.Length <= 254 && r.Password?.Length is > 0 and <= 128, "Revisa el correo y contraseña.");
    var user = await db.Users.SingleOrDefaultAsync(x => x.Email == r.Email.Trim().ToLowerInvariant());
    Rules.Check(user != null && new PasswordHasher<User>().VerifyHashedPassword(user, user.PasswordHash, r.Password!) != PasswordVerificationResult.Failed, "Correo o contraseña incorrectos.", 401);
    await SignIn(ctx, user!); return Results.Ok(new { user!.Id, user.Name, user.Role });
}).RequireRateLimiting("auth");
app.MapPost("/api/auth/logout", async (HttpContext ctx) => { await ctx.SignOutAsync(); return Results.NoContent(); }).RequireAuthorization();
app.MapGet("/api/haircuts", async (AppDb db, ClaimsPrincipal u) => Results.Ok(await db.Haircuts.Where(x => x.Active || u.IsInRole("Admin")).OrderBy(x => x.Name).ToListAsync()));
var admin = app.MapGroup("/api/admin").RequireAuthorization(p => p.RequireRole("Admin"));
admin.MapPost("/haircuts", async (HaircutRequest r, AppDb db) =>
{ var h = new Haircut { Name = Rules.Text(r.Name, 120, "el corte"), Description = Rules.Text(r.Description, 1000, "la descripción"), Active = r.Active }; db.Haircuts.Add(h); await db.SaveChangesAsync(); return Results.Ok(h); });
admin.MapPut("/haircuts/{id:int}", async (int id, HaircutRequest r, AppDb db) =>
{ var h = await db.Haircuts.FindAsync(id) ?? throw new AppError("Corte no encontrado.", 404); h.Name = Rules.Text(r.Name, 120, "el corte"); h.Description = Rules.Text(r.Description, 1000, "la descripción"); h.Active = r.Active; await db.SaveChangesAsync(); return Results.Ok(h); });
app.MapGet("/api/shops", async (AppDb db) => Results.Ok(await db.Shops.OrderBy(x => x.Name).Select(x => new { x.Id, x.Name, x.Description, x.Address, x.Phone, x.Latitude, x.Longitude, x.TimeZone, photo = db.ShopPhotos.Where(p => p.ShopId == x.Id).Select(p => p.Url).FirstOrDefault() }).ToListAsync()));
app.MapGet("/api/shops/{id:int}", async (int id, AppDb db) =>
{
    var shop = await db.Shops.Where(x => x.Id == id).Select(x => new { x.Id, x.Name, x.Description, x.Address, x.Phone, x.Latitude, x.Longitude, x.TimeZone }).SingleOrDefaultAsync() ?? throw new AppError("Barbería no encontrada.", 404);
    return Results.Ok(new { shop, photos = await db.ShopPhotos.Where(x => x.ShopId == id).Select(x => new { x.Id, x.Url, x.Kind }).ToListAsync(),
        barbers = await db.Barbers.Where(x => x.ShopId == id && x.Active).Select(x => new { x.Id, x.Name }).ToListAsync(),
        offerings = await db.Offerings.Where(x => x.Barber.ShopId == id && x.Barber.Active && x.Active && x.Haircut.Active).Select(x => new { x.Id, x.BarberId, x.HaircutId, name = x.Haircut.Name, x.Haircut.Description, x.Price, x.Minutes }).ToListAsync(),
        products = await db.Products.Where(x => x.ShopId == id && x.Active).Select(x => new { x.Id, x.Name, x.Description, x.Price, x.Stock }).ToListAsync() });
});
app.MapGet("/api/offerings/{id:int}/slots", async (int id, string date, AppDb db) =>
{
    Rules.Check(DateOnly.TryParseExact(date, "yyyy-MM-dd", out var day), "Fecha no válida.");
    var offer = await db.Offerings.Include(x => x.Barber).ThenInclude(x => x.Shop).Include(x => x.Haircut).SingleOrDefaultAsync(x => x.Id == id) ?? throw new AppError("Servicio no encontrado.", 404);
    Rules.Check(offer.Active && offer.Barber.Active && offer.Haircut.Active, "Servicio no disponible.");
    var zone = Rules.Zone(offer.Barber.Shop.TimeZone);
    var localToday = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, zone));
    Rules.Check(day >= localToday && day <= localToday.AddDays(180), "Fecha fuera del periodo de reservas.");
    var periods = await db.WorkPeriods.Where(x => x.BarberId == offer.BarberId && x.Day == (int)day.DayOfWeek).ToListAsync();
    var lower = TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(TimeOnly.MinValue), zone);
    var upper = lower.AddDays(2);
    var bookings = await db.Bookings.Where(x => x.BarberId == offer.BarberId && x.Status != "Cancelled" && x.EndUtc > lower && x.StartUtc < upper).ToListAsync();
    var blocks = await db.Blocks.Where(x => x.BarberId == offer.BarberId && x.EndUtc > lower && x.StartUtc < upper).ToListAsync();
    var slots = new List<object>();
    foreach (var p in periods)
        for (int minute = p.StartMinute; minute + offer.Minutes <= p.EndMinute; minute += 15)
        {
            var local = day.ToDateTime(TimeOnly.MinValue).AddMinutes(minute);
            if (zone.IsInvalidTime(local) || zone.IsAmbiguousTime(local)) continue;
            var start = TimeZoneInfo.ConvertTimeToUtc(local, zone); var end = start.AddMinutes(offer.Minutes);
            if (start > DateTime.UtcNow && !bookings.Any(x => Rules.Overlaps(start, end, x.StartUtc, x.EndUtc)) && !blocks.Any(x => Rules.Overlaps(start, end, x.StartUtc, x.EndUtc)))
                slots.Add(new { start = new DateTimeOffset(start), label = local.ToString("HH:mm") });
        }
    return Results.Ok(slots);
});
var management = app.MapGroup("/api/manage").RequireAuthorization(p => p.RequireRole("Barber"));
management.MapGet("/shops", async (AppDb db, ClaimsPrincipal u) => Results.Ok(await db.Shops.Where(x => x.OwnerId == Rules.UserId(u)).ToListAsync()));
void ApplyShop(Shop s, ShopRequest r)
{
    s.Name = Rules.Text(r.Name, 120, "el nombre"); s.Description = Rules.Text(r.Description, 2000, "la descripción"); s.Address = Rules.Text(r.Address, 500, "la dirección"); s.Phone = Rules.Text(r.Phone, 30, "el teléfono");
    Rules.Check(double.IsFinite(r.Latitude) && double.IsFinite(r.Longitude) && r.Latitude is >= -90 and <= 90 && r.Longitude is >= -180 and <= 180, "Coordenadas no válidas.");
    Rules.Zone(r.TimeZone); s.Latitude = r.Latitude; s.Longitude = r.Longitude; s.TimeZone = r.TimeZone;
}
management.MapPost("/shops", async (ShopRequest r, AppDb db, ClaimsPrincipal u) =>
{ var s = new Shop { OwnerId = Rules.UserId(u) }; ApplyShop(s, r); db.Shops.Add(s); await db.SaveChangesAsync(); return Results.Ok(new { s.Id }); });
management.MapPut("/shops/{id:int}", async (int id, ShopRequest r, AppDb db, ClaimsPrincipal u) =>
{ var s = await Rules.OwnedShop(db, id, u); Rules.Check(s.TimeZone == r.TimeZone || !await db.Bookings.AnyAsync(x => x.Barber.ShopId == id && x.Status != "Cancelled" && x.EndUtc > DateTime.UtcNow), "No cambies la zona horaria mientras haya citas futuras."); ApplyShop(s, r); await db.SaveChangesAsync(); return Results.NoContent(); });
management.MapGet("/shops/{id:int}/team", async (int id, AppDb db, ClaimsPrincipal u) =>
{ await Rules.OwnedShop(db, id, u); return Results.Ok(new { barbers = await db.Barbers.Where(x => x.ShopId == id).Select(x => new { x.Id, x.Name, x.Active }).ToListAsync(), offerings = await db.Offerings.Where(x => x.Barber.ShopId == id).Select(x => new { x.Id, x.BarberId, x.HaircutId, x.Price, x.Minutes, x.Active }).ToListAsync(), periods = await db.WorkPeriods.Where(x => x.Barber.ShopId == id).Select(x => new { x.Id, x.BarberId, x.Day, x.StartMinute, x.EndMinute }).ToListAsync(), blocks = await db.Blocks.Where(x => x.Barber.ShopId == id && x.EndUtc > DateTime.UtcNow).Select(x => new { x.Id, x.BarberId, x.StartUtc, x.EndUtc }).ToListAsync(), products = await db.Products.Where(x => x.ShopId == id).Select(x => new { x.Id, x.Name, x.Description, x.Price, x.Stock, x.Active }).ToListAsync() }); });
management.MapPost("/shops/{id:int}/barbers", async (int id, BarberRequest r, AppDb db, ClaimsPrincipal u) =>
{ await Rules.OwnedShop(db, id, u); var b = new Barber { ShopId = id, Name = Rules.Text(r.Name, 120, "el nombre"), Active = r.Active }; db.Barbers.Add(b); await db.SaveChangesAsync(); return Results.Ok(new { b.Id }); });
management.MapPut("/barbers/{id:int}", async (int id, BarberRequest r, AppDb db, ClaimsPrincipal u) =>
{ await Rules.OwnedBarber(db, id, u); await using var tx = await db.Database.BeginTransactionAsync(); var b = await Rules.LockBarber(db, id); b.Name = Rules.Text(r.Name, 120, "el nombre"); b.Active = r.Active; await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent(); });
management.MapPost("/barbers/{id:int}/offerings", async (int id, OfferingRequest r, AppDb db, ClaimsPrincipal u) =>
{
    await Rules.OwnedBarber(db, id, u); Rules.Money(r.Price); Rules.Check(r.Minutes is >= 5 and <= 480, "La duración debe estar entre 5 y 480 minutos.");
    Rules.Check(await db.Haircuts.AnyAsync(x => x.Id == r.HaircutId && x.Active), "Corte no disponible en el catálogo.");
    await using var tx = await db.Database.BeginTransactionAsync(); await Rules.LockBarber(db, id);
    var offer = await db.Offerings.SingleOrDefaultAsync(x => x.BarberId == id && x.HaircutId == r.HaircutId);
    if (offer == null) { offer = new Offering { BarberId = id, HaircutId = r.HaircutId }; db.Offerings.Add(offer); }
    offer.Price = r.Price; offer.Minutes = r.Minutes; offer.Active = r.Active; await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new { offer.Id });
});
management.MapPut("/barbers/{id:int}/periods", async (int id, List<PeriodRequest> r, AppDb db, ClaimsPrincipal u) =>
{
    await Rules.OwnedBarber(db, id, u); Rules.Check(r != null && r.Count <= 35 && r.All(x => x.Day is >= 0 and <= 6 && x.StartMinute >= 0 && x.EndMinute <= 1440 && x.EndMinute > x.StartMinute), "Horario no válido.");
    foreach (var day in r!.GroupBy(x => x.Day)) { var sorted = day.OrderBy(x => x.StartMinute).ToList(); for (int i = 1; i < sorted.Count; i++) Rules.Check(sorted[i].StartMinute >= sorted[i - 1].EndMinute, "Los periodos de trabajo se empalman."); }
    await using var tx = await db.Database.BeginTransactionAsync(); await Rules.LockBarber(db, id);
    db.WorkPeriods.RemoveRange(await db.WorkPeriods.Where(x => x.BarberId == id).ToListAsync());
    db.WorkPeriods.AddRange(r!.Select(x => new WorkPeriod { BarberId = id, Day = x.Day, StartMinute = x.StartMinute, EndMinute = x.EndMinute }));
    await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent();
});
management.MapPost("/barbers/{id:int}/blocks", async (int id, BlockRequest r, AppDb db, ClaimsPrincipal u) =>
{
    await Rules.OwnedBarber(db, id, u); Rules.Check(r.End > r.Start && r.End - r.Start <= TimeSpan.FromDays(60), "Periodo de bloqueo no válido.");
    await using var tx = await db.Database.BeginTransactionAsync(); await Rules.LockBarber(db, id);
    var start = r.Start.UtcDateTime; var end = r.End.UtcDateTime;
    Rules.Check(!await db.Bookings.AnyAsync(x => x.BarberId == id && x.Status != "Cancelled" && x.StartUtc < end && x.EndUtc > start), "Hay citas en ese periodo. Cancélalas antes de bloquearlo.", 409);
    var b = new Block { BarberId = id, StartUtc = start, EndUtc = end }; db.Blocks.Add(b); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.Ok(new { b.Id });
});
management.MapDelete("/blocks/{id:int}", async (int id, AppDb db, ClaimsPrincipal u) =>
{ var b = await db.Blocks.FindAsync(id) ?? throw new AppError("Bloqueo no encontrado.", 404); await Rules.OwnedBarber(db, b.BarberId, u); db.Blocks.Remove(b); await db.SaveChangesAsync(); return Results.NoContent(); });
void ApplyProduct(Product p, ProductRequest r) { p.Name = Rules.Text(r.Name, 120, "el producto"); p.Description = Rules.Text(r.Description, 1000, "la descripción"); Rules.Money(r.Price); Rules.Check(r.Stock is >= 0 and <= 1000000, "Existencias no válidas."); p.Price = r.Price; p.Stock = r.Stock; p.Active = r.Active; }
management.MapPost("/shops/{id:int}/products", async (int id, ProductRequest r, AppDb db, ClaimsPrincipal u) =>
{ await Rules.OwnedShop(db, id, u); var p = new Product { ShopId = id }; ApplyProduct(p, r); db.Products.Add(p); await db.SaveChangesAsync(); return Results.Ok(new { p.Id }); });
management.MapPut("/products/{id:int}", async (int id, ProductRequest r, AppDb db, ClaimsPrincipal u) =>
{ await using var tx = await db.Database.BeginTransactionAsync(); var p = await db.Products.FromSqlInterpolated($"SELECT * FROM `Products` WHERE `Id` = {id} FOR UPDATE").SingleOrDefaultAsync() ?? throw new AppError("Producto no encontrado.", 404); await Rules.OwnedShop(db, p.ShopId, u); ApplyProduct(p, r); await db.SaveChangesAsync(); await tx.CommitAsync(); return Results.NoContent(); });
management.MapPost("/shops/{id:int}/photos", async (int id, HttpRequest request, AppDb db, ClaimsPrincipal u, IWebHostEnvironment env) =>
{
    await Rules.OwnedShop(db, id, u);
    Rules.Check(request.ContentLength is > 0 and <= 5500000, "La foto debe pesar menos de 5 MB.");
    var form = await request.ReadFormAsync(); var file = form.Files.GetFile("photo"); var kind = form["kind"].ToString();
    Rules.Check(file != null && file.Length is > 12 and <= 5000000 && kind is "Exterior" or "Interior", "Selecciona una foto de interior o exterior (máximo 5 MB).");
    Rules.Check(await db.ShopPhotos.CountAsync(x => x.ShopId == id) < 12, "Puedes subir hasta 12 fotos.");
    using var stream = new MemoryStream(); await file!.CopyToAsync(stream); var bytes = stream.ToArray();
    var ext = bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff ? ".jpg" : bytes.Take(8).SequenceEqual(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 }) ? ".png" : System.Text.Encoding.ASCII.GetString(bytes, 0, 4) == "RIFF" && System.Text.Encoding.ASCII.GetString(bytes, 8, 4) == "WEBP" ? ".webp" : null;
    Rules.Check(ext != null, "Solo se aceptan fotos JPEG, PNG o WebP.");
    var folder = Path.Combine(env.ContentRootPath, "wwwroot", "uploads"); Directory.CreateDirectory(folder); var name = Guid.NewGuid().ToString("N") + ext;
    await File.WriteAllBytesAsync(Path.Combine(folder, name), bytes);
    var photo = new ShopPhoto { ShopId = id, Url = "/uploads/" + name, Kind = kind }; db.ShopPhotos.Add(photo); await db.SaveChangesAsync(); return Results.Ok(new { photo.Id, photo.Url });
});
management.MapDelete("/photos/{id:int}", async (int id, AppDb db, ClaimsPrincipal u, IWebHostEnvironment env) =>
{
    var p = await db.ShopPhotos.FindAsync(id) ?? throw new AppError("Foto no encontrada.", 404);
    await Rules.OwnedShop(db, p.ShopId, u);
    db.ShopPhotos.Remove(p); await db.SaveChangesAsync();
    try { File.Delete(Path.Combine(env.ContentRootPath, "wwwroot", "uploads", Path.GetFileName(p.Url))); }
    catch (IOException ex) { app.Logger.LogWarning(ex, "No se pudo limpiar la foto retirada {Id}", id); }
    return Results.NoContent();
});
app.MapPost("/api/bookings", async (BookingRequest r, Reservations reservations, ClaimsPrincipal u) =>
{ var b = await reservations.Create(r, Rules.UserId(u)); return Results.Ok(new { b.Id, b.Total }); }).RequireAuthorization(p => p.RequireRole("Client"));
app.MapGet("/api/bookings", async (AppDb db, ClaimsPrincipal u) =>
{
    var uid = Rules.UserId(u);
    return Results.Ok(await db.Bookings.Where(x => x.CustomerId == uid || x.Barber.Shop.OwnerId == uid).OrderBy(x => x.StartUtc).Select(x => new {
        x.Id, x.Status, start = new DateTimeOffset(DateTime.SpecifyKind(x.StartUtc, DateTimeKind.Utc)), end = new DateTimeOffset(DateTime.SpecifyKind(x.EndUtc, DateTimeKind.Utc)),
        x.HaircutName, x.ServicePrice, x.Total, customer = x.Customer.Name, barber = x.Barber.Name, shop = x.Barber.Shop.Name, x.Barber.ShopId, x.Barber.Shop.TimeZone,
        items = x.Items.Select(i => new { i.Name, i.Quantity, i.UnitPrice }) }).ToListAsync());
}).RequireAuthorization();
app.MapPut("/api/bookings/{id:int}/status", async (int id, StatusRequest r, Reservations reservations, ClaimsPrincipal u) =>
{ await reservations.ChangeStatus(id, r.Status, u); return Results.NoContent(); }).RequireAuthorization();
app.MapGet("/api/health", () => Results.Ok(new { status = "ok" }));
// Migration is explicit: dotnet run -- --migrate. Never mutate schema on normal startup.
if (args.Contains("--migrate"))
{
    using var scope = app.Services.CreateScope(); var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    await db.Database.MigrateAsync(); await Seed.Run(db, builder.Configuration); return;
}
app.MapFallbackToFile("index.html");
app.Run();
public partial class Program { }
