using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
namespace BackEnd.Data;
// Schema generation does not require a running database or credentials.
public class DesignFactory : IDesignTimeDbContextFactory<AppDb>
{
    public AppDb CreateDbContext(string[] args) => new(new DbContextOptionsBuilder<AppDb>()
        .UseMySql("Server=localhost;Database=gestor_citas;User=unused", new MariaDbServerVersion(new Version(10, 11, 0))).Options);
}
