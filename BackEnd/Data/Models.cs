using Microsoft.EntityFrameworkCore;
namespace BackEnd.Data;

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string PasswordHash { get; set; } = "";
    public string Role { get; set; } = "Client";
}
public class Shop
{
    public int Id { get; set; }
    public int OwnerId { get; set; }
    public User Owner { get; set; } = null!;
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Address { get; set; } = "";
    public string Phone { get; set; } = "";
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public string TimeZone { get; set; } = "America/Merida";
}
public class ShopPhoto
{
    public int Id { get; set; }
    public int ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public string Url { get; set; } = "";
    public string Kind { get; set; } = "Exterior";
}
public class Barber
{
    public int Id { get; set; }
    public int ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public string Name { get; set; } = "";
    public bool Active { get; set; } = true;
}
public class Haircut
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public bool Active { get; set; } = true;
}
public class Offering
{
    public int Id { get; set; }
    public int BarberId { get; set; }
    public Barber Barber { get; set; } = null!;
    public int HaircutId { get; set; }
    public Haircut Haircut { get; set; } = null!;
    public decimal Price { get; set; }
    public int Minutes { get; set; }
    public bool Active { get; set; } = true;
}
public class WorkPeriod
{
    public int Id { get; set; }
    public int BarberId { get; set; }
    public Barber Barber { get; set; } = null!;
    public int Day { get; set; } // Sunday = 0, local shop time
    public int StartMinute { get; set; }
    public int EndMinute { get; set; }
}
public class Block
{
    public int Id { get; set; }
    public int BarberId { get; set; }
    public Barber Barber { get; set; } = null!;
    public DateTime StartUtc { get; set; }
    public DateTime EndUtc { get; set; }
}
public class Product
{
    public int Id { get; set; }
    public int ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public decimal Price { get; set; }
    public int Stock { get; set; }
    public bool Active { get; set; } = true;
}
public class Booking
{
    public int Id { get; set; }
    public int CustomerId { get; set; }
    public User Customer { get; set; } = null!;
    public int BarberId { get; set; }
    public Barber Barber { get; set; } = null!;
    public DateTime StartUtc { get; set; }
    public DateTime EndUtc { get; set; }
    public string Status { get; set; } = "Pending";
    public string HaircutName { get; set; } = "";
    public decimal ServicePrice { get; set; }
    public decimal Total { get; set; }
    public List<BookingItem> Items { get; set; } = [];
}
public class BookingItem
{
    public int Id { get; set; }
    public int BookingId { get; set; }
    public Booking Booking { get; set; } = null!;
    public int ProductId { get; set; }
    public Product Product { get; set; } = null!;
    public string Name { get; set; } = "";
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
}
public class MailJob
{
    public int Id { get; set; }
    public string Recipient { get; set; } = "";
    public string Subject { get; set; } = "";
    public string Body { get; set; } = "";
    public DateTime? SentUtc { get; set; }
    public DateTime NextAttemptUtc { get; set; }
    public int Attempts { get; set; }
}
public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Shop> Shops => Set<Shop>();
    public DbSet<ShopPhoto> ShopPhotos => Set<ShopPhoto>();
    public DbSet<Barber> Barbers => Set<Barber>();
    public DbSet<Haircut> Haircuts => Set<Haircut>();
    public DbSet<Offering> Offerings => Set<Offering>();
    public DbSet<WorkPeriod> WorkPeriods => Set<WorkPeriod>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<MailJob> MailJobs => Set<MailJob>();
    protected override void OnModelCreating(ModelBuilder m)
    {
        m.UseCollation("utf8mb4_unicode_ci");
        m.Entity<User>().HasIndex(x => x.Email).IsUnique();
        m.Entity<User>().Property(x => x.Email).HasMaxLength(254);
        m.Entity<Haircut>().HasIndex(x => x.Name).IsUnique();
        m.Entity<Haircut>().Property(x => x.Name).HasMaxLength(120);
        m.Entity<Offering>().HasIndex(x => new { x.BarberId, x.HaircutId }).IsUnique();
        m.Entity<Booking>().HasIndex(x => new { x.BarberId, x.StartUtc, x.EndUtc });
        m.Entity<Block>().HasIndex(x => new { x.BarberId, x.StartUtc });
        foreach (var entity in m.Model.GetEntityTypes())
        {
            foreach (var property in entity.GetProperties().Where(p => p.ClrType == typeof(decimal)))
            { property.SetPrecision(10); property.SetScale(2); }
            foreach (var fk in entity.GetForeignKeys()) fk.DeleteBehavior = DeleteBehavior.Restrict;
        }
    }
}
