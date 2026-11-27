namespace BackEnd.Data;

public class Review
{
    public const string ClientToShop = "ClientToShop";
    public const string ShopToClient = "ShopToClient";
    public int Id { get; set; }
    public int Rating { get; set; }
    public string Comment { get; set; } = "";
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
    public int BookingId { get; set; }
    public Booking Booking { get; set; } = null!;
    public int AuthorId { get; set; }
    public User Author { get; set; } = null!;
    public int CustomerId { get; set; }
    public User Customer { get; set; } = null!;
    public int ShopId { get; set; }
    public Shop Shop { get; set; } = null!;
    public string Direction { get; set; } = "";
}
