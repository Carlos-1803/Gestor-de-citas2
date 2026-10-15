using System.Net;
using System.Net.Mail;
using BackEnd.Data;
using Microsoft.EntityFrameworkCore;
namespace BackEnd.Services;
// One worker instance per deployment. Jobs are committed with the reservation.
public class MailWorker(IServiceScopeFactory scopes, IConfiguration config, ILogger<MailWorker> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stop)
    {
        if (string.IsNullOrWhiteSpace(config["Smtp:Host"])) { log.LogInformation("SMTP sin configurar: los avisos quedan pendientes en MailJobs."); return; }
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(stop))
        {
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDb>();
                var jobs = await db.MailJobs.Where(x => x.SentUtc == null && x.NextAttemptUtc <= DateTime.UtcNow && x.Attempts < 10).OrderBy(x => x.Id).Take(20).ToListAsync(stop);
                foreach (var job in jobs)
                {
                    job.Attempts++;
                    try
                    {
                        using var smtp = new SmtpClient(config["Smtp:Host"], config.GetValue("Smtp:Port", 587)) { EnableSsl = config.GetValue("Smtp:EnableSsl", true) };
                        if (!string.IsNullOrEmpty(config["Smtp:User"])) smtp.Credentials = new NetworkCredential(config["Smtp:User"], config["Smtp:Password"]);
                        using var message = new MailMessage(config["Smtp:From"]!, job.Recipient, job.Subject, job.Body);
                        await smtp.SendMailAsync(message, stop);
                        job.SentUtc = DateTime.UtcNow;
                    }
                    catch (Exception ex) when (!stop.IsCancellationRequested)
                    { log.LogWarning("No se pudo enviar el aviso {Id}: {Type}", job.Id, ex.GetType().Name); job.NextAttemptUtc = DateTime.UtcNow.AddMinutes(Math.Min(60, job.Attempts * job.Attempts)); }
                    await db.SaveChangesAsync(stop);
                }
            }
            catch (Exception ex) when (!stop.IsCancellationRequested) { log.LogError(ex, "Error procesando avisos."); }
        }
    }
}
