using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BackEnd.Data;
// A fixed provider version keeps schema generation offline. Database updates use
// the project's JSON connection (or the explicit EF --connection override).
public class DesignFactory : IDesignTimeDbContextFactory<AppDb>
{
    public AppDb CreateDbContext(string[] args)
    {
        var current = Directory.GetCurrentDirectory();
        var folder = File.Exists(Path.Combine(current, "BackEnd", "appsettings.json"))
            ? Path.Combine(current, "BackEnd") : current;
        if (!File.Exists(Path.Combine(folder, "appsettings.json"))) folder = AppContext.BaseDirectory;
        var config = new ConfigurationBuilder().SetBasePath(folder)
            .AddJsonFile("appsettings.json").AddJsonFile("appsettings.Development.json", optional: true).Build();
        var connection = config.GetConnectionString("Database")
            ?? throw new InvalidOperationException("Configura ConnectionStrings:Database en BackEnd/appsettings.json.");
        return new AppDb(new DbContextOptionsBuilder<AppDb>()
            .UseMySql(connection, new MariaDbServerVersion(new Version(10, 11, 0))).Options);
    }
}
