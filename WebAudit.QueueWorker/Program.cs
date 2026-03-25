using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using WebAudit.QueueWorker;

Host.CreateDefaultBuilder(args)
    .ConfigureServices((ctx, services) =>
    {
        services.AddHostedService<AuditQueueWorker>();
    })
    .Build()
    .Run();
