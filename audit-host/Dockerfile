# Build runner (CLI) then host; runtime image runs only audit-host.
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS dotnet_build
WORKDIR /src
COPY audit-host/ ./audit-host/
COPY WebAudit.Core/ ./WebAudit.Core/
COPY WebAudit.Postgres/ ./WebAudit.Postgres/
COPY WebAudit.Shared/ ./WebAudit.Shared/
RUN dotnet publish audit-host/AuditHost.csproj -c Release -o /app/publish /p:UseAppHost=false

FROM node:20-bookworm AS node_build
WORKDIR /runner
COPY runner/package.json runner/package-lock.json ./
RUN npm ci
COPY runner/ ./
RUN npm run build && npx playwright install --with-deps chromium

# Use node:20-bookworm as final base — same as node_build, same libc/libnspr4 ABI.
FROM node:20-bookworm AS final
# Install .NET 8 ASP.NET Core runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends wget curl ca-certificates \
    && wget -q https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb \
    && dpkg -i packages-microsoft-prod.deb \
    && rm packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends aspnetcore-runtime-8.0 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=dotnet_build /app/publish .
COPY --from=node_build /runner /repo/runner
# Playwright browser cache (chromium headless shell) from build stage
COPY --from=node_build /root/.cache/ms-playwright /root/.cache/ms-playwright
# Install Playwright system library dependencies (libnspr4, libnss3, etc.) without re-downloading browsers
RUN cd /repo/runner && npx playwright install-deps chromium && rm -rf /var/lib/apt/lists/*
ENV ASPNETCORE_URLS=http://0.0.0.0:5090
ENV AuditHost__RunnerDirectory=/repo/runner
ENV AuditHost__DataDirectory=/app/data
RUN mkdir -p /app/data
EXPOSE 5090
ENTRYPOINT ["dotnet", "AuditHost.dll"]
