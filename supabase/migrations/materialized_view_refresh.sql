-- Refresh materialized views for dashboard metrics
create or replace function refresh_materialized_views()
returns void
language plpgsql
as $$
begin
  refresh materialized view concurrently daily_dashboard_metrics;
  refresh materialized view concurrently monthly_dashboard_metrics;
end;
$$;