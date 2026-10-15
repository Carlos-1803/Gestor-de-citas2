using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
namespace BackEnd.Data;
public static class Seed
{
    public static async Task Run(AppDb db, IConfiguration config)
    {
        string[] cuts = ["Degradado bajo", "Degradado medio", "Degradado alto", "Degradado a piel", "Taper fade", "Corte clásico", "Buzz cut", "Crew cut", "Pompadour", "Quiff", "Undercut", "Mullet", "French crop", "Corte con tijera", "Mohicano", "Flat top", "Corte texturizado", "Corte de rizos", "Corte infantil", "Diseño con líneas"];
        var existing = await db.Haircuts.Select(x => x.Name).ToListAsync();
        foreach (var name in cuts.Except(existing)) db.Haircuts.Add(new Haircut { Name = name, Description = $"{name}. Consulta con tu barbero el acabado y los detalles." });
        var email = config["Admin:Email"]?.Trim().ToLowerInvariant(); var password = config["Admin:Password"];
        if (!string.IsNullOrWhiteSpace(email) && !string.IsNullOrWhiteSpace(password) && !await db.Users.AnyAsync(x => x.Email == email))
        {
            Services.Rules.Check(password.Length >= 12, "La contraseña inicial de administración requiere 12 caracteres.");
            var user = new User { Name = "Administración", Email = email, Role = "Admin" };
            user.PasswordHash = new PasswordHasher<User>().HashPassword(user, password); db.Users.Add(user);
        }
        await db.SaveChangesAsync();
    }
}
