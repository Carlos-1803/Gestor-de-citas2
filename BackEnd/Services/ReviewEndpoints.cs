using System.Security.Claims;
using BackEnd.Contracts;
using BackEnd.Data;
using Microsoft.EntityFrameworkCore;
using MySqlConnector;

namespace BackEnd.Services;

public static class ReviewEndpoints
{
    public static void MapReviews(this WebApplication app)
    {
        app.MapPost("/api/reviews", async (ReviewRequest request, AppDb db, ClaimsPrincipal user) =>
        {
            Rules.Check(request.Rating is >= 1 and <= 5, "Selecciona una puntuación entre 1 y 5 estrellas.");
            var comment = request.Comment?.Trim() ?? "";
            Rules.Check(comment.Length <= 2000, "El comentario no puede superar 2000 caracteres.");
            var booking = await db.Bookings.AsNoTracking().Include(b => b.Barber).ThenInclude(b => b.Shop)
                .SingleOrDefaultAsync(b => b.Id == request.BookingId) ?? throw new AppError("Cita no encontrada.", 404);
            var authorId = Rules.UserId(user);
            string direction;
            if (user.IsInRole("Client") && booking.CustomerId == authorId)
                direction = Review.ClientToShop;
            else if (user.IsInRole("Barber") && booking.Barber.Shop.OwnerId == authorId)
                direction = Review.ShopToClient;
            else throw new AppError("No puedes calificar esta cita.", 403);
            Rules.Check(booking.Status == "Completed" && booking.EndUtc <= DateTime.UtcNow,
                "Solo puedes calificar citas completadas cuya hora de fin ya pasó.", 409);
            var review = new Review
            {
                BookingId = booking.Id, AuthorId = authorId, CustomerId = booking.CustomerId,
                ShopId = booking.Barber.ShopId, Direction = direction, Rating = request.Rating, Comment = comment
            };
            db.Reviews.Add(review);
            try { await db.SaveChangesAsync(); }
            catch (DbUpdateException ex) when (ex.InnerException is MySqlException { Number: 1062 })
            { throw new AppError("Ya publicaste una reseña para esta cita.", 409); }
            return Results.Created($"/api/shops/{review.ShopId}/reviews", new { review.Id, review.Direction });
        }).RequireAuthorization(p => p.RequireRole("Client", "Barber"));

        app.MapGet("/api/shops/{id:int}/reviews", async (int id, AppDb db, int page = 1) =>
        {
            Rules.Check(await db.Shops.AnyAsync(s => s.Id == id), "Barbería no encontrada.", 404);
            return await List(db.Reviews.Where(r => r.ShopId == id && r.Direction == Review.ClientToShop), page);
        });
        app.MapGet("/api/manage/shops/{id:int}/reviews", async (int id, AppDb db, ClaimsPrincipal user, int page = 1) =>
        {
            await Rules.OwnedShop(db, id, user);
            return await List(db.Reviews.Where(r => r.ShopId == id && r.Direction == Review.ClientToShop), page);
        }).RequireAuthorization(p => p.RequireRole("Barber"));
        app.MapGet("/api/manage/shops/{shopId:int}/customers/{customerId:int}/reviews", async (
            int shopId, int customerId, AppDb db, ClaimsPrincipal user, int page = 1) =>
        {
            await Rules.OwnedShop(db, shopId, user);
            Rules.Check(await db.Bookings.AnyAsync(b => b.Barber.ShopId == shopId && b.CustomerId == customerId),
                "El cliente no tiene citas en esta sucursal.", 404);
            // Customer feedback is private and scoped to the owner's selected branch.
            return await List(db.Reviews.Where(r => r.ShopId == shopId && r.CustomerId == customerId && r.Direction == Review.ShopToClient), page);
        }).RequireAuthorization(p => p.RequireRole("Barber"));
        app.MapGet("/api/me/reviews", (AppDb db, ClaimsPrincipal user, int page = 1) =>
            List(db.Reviews.Where(r => r.CustomerId == Rules.UserId(user) && r.Direction == Review.ShopToClient), page))
            .RequireAuthorization(p => p.RequireRole("Client"));
    }

    private static async Task<IResult> List(IQueryable<Review> query, int page)
    {
        const int pageSize = 20;
        Rules.Check(page is >= 1 and <= 100000, "Página no válida.");
        var count = await query.CountAsync();
        var average = await query.Select(r => (double?)r.Rating).AverageAsync();
        var rows = await query.AsNoTracking().OrderByDescending(r => r.CreatedAtUtc).ThenByDescending(r => r.Id)
            .Skip((page - 1) * pageSize).Take(pageSize)
            .Select(r => new { r.Id, r.Rating, r.Comment, r.CreatedAtUtc, r.BookingId, authorName = r.Author.Name,
                r.ShopId, shopName = r.Shop.Name, r.Direction }).ToListAsync();
        return Results.Ok(new { count, average = average.HasValue ? Math.Round(average.Value, 1) : (double?)null,
            page, pageSize, items = rows.Select(r => new { r.Id, r.Rating, r.Comment,
                createdAt = new DateTimeOffset(DateTime.SpecifyKind(r.CreatedAtUtc, DateTimeKind.Utc)),
                r.BookingId, r.authorName, r.ShopId, r.shopName, r.Direction }) });
    }
}
