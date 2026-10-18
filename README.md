# Pickup Routes Service

A small web service that helps answer one question: 
**which pickup point is closest to the customer by car, and how long does it take to get there?**

You give it the customer's location and a list of pickup points. It asks the
public OSRM routing server for the drive to each one and returns the results,
fastest first.

## Run it

You need Node.js 20 or newer.

```bash
npm install
npm run dev                    # development, restarts on changes
npm run build && npm start     # compiled version (run build and start as separate commands on Windows Powershell versions 5 or older)
```

The service runs on http://localhost:3000. Try it:

```bash
curl "http://localhost:3000/routes?src=13.388860,52.517037&dst=13.397634,52.529407&dst=13.428555,52.523219"
```

Other commands:

```bash
npm test                 # all tests, no internet needed
npx tsc --noEmit         # type check
docker build -t pickup-routes-service .
docker run --rm -p 3000:3000 pickup-routes-service
```

## API

### `GET /routes`

| Parameter | Meaning |
|---|---|
| `src` | The customer's location as `longitude,latitude`. Exactly one. |
| `dst` | A pickup point as `longitude,latitude`. One or more. |

Example response:

```json
{
  "source": "13.388860,52.517037",
  "routes": [
    { "destination": "13.397634,52.529407", "duration": 260.4, "distance": 1888 },
    { "destination": "13.428555,52.523219", "duration": 388.6, "distance": 3800.9 }
  ]
}
```

`duration` is in seconds and `distance` is in metres. Routes are sorted by
duration, and by distance when two durations are equal.

| Status | Meaning |
|---|---|
| 400 | The input is invalid. The message says what to fix. |
| 502 | OSRM is down or sent something unusable. |
| 504 | OSRM took too long to answer. |
| 500 | A bug on our side. Details are logged, not returned. |

`GET /health` returns `{"status":"ok"}` for load balancers and orchestrators.

## Assumptions

Where the instructions left room for interpretation, I made these choices.

- **Coordinates are `longitude,latitude`.** The text says "latitude and
  longitude", but the examples (13.38, 52.51 is Berlin) and OSRM both put
  longitude first.
- **Input is checked strictly.** Exactly one `src`, at least one `dst`, and
  every coordinate must be two valid numbers in range. Anything else is a 400.
  I would rather reject a request than guess what the caller meant.
- **At most 50 destinations per request.** The public OSRM server is shared,
  so I did not want unlimited input. The limit is configurable.
- **Duplicate destinations are removed**, even if written differently
  (`13.3976340` and `13.397634` are the same point).
- **`source` is returned exactly as it was sent**, like in the example.
- **A destination that cannot be reached is left out and logged.** A place
  you cannot drive to is not a usable pickup point. If none can be reached,
  `routes` is an empty list.
- **If OSRM itself fails, the whole request fails** (502 or 504). I chose not
  to return a partial list, because the missing destination might have been
  the closest one, and the caller would have no way to know.

## What I found while testing OSRM

I called OSRM by hand before writing any code, and two things surprised me.

1. **The hostname in the assignment does not work.** `router.projectosrm.org`
   did not resolve when I tested it. The working host is
   `router.project-osrm.org` (with a hyphen), which is what the service uses.
2. **OSRM says `"code":"Ok"` for places no one can drive to.** I tried a point
   in the middle of the Atlantic. OSRM moved it to the nearest road, near
   Lisbon about 1,770 km away, and returned a normal-looking route. Trusting
   the status code alone would have put an ocean "pickup point" into the
   results.

   To handle this, the service reads how far OSRM had to move each point.
   If it is more than 1,000 m (`MAX_SNAP_DISTANCE_M`), the route is treated as
   unreachable. This also protects against a customer location that is not
   near any road.

Also, the numbers in OSRM's example response differ from what the live server
returns today, because the map data changes. So the tests never depend on live
OSRM answers. They use a fake OSRM instead.

## How it is built

```
src/
  index.ts         starts the server, shuts down gracefully
  app.ts           Express app, error handling, /health
  routes.ts        the /routes handler
  validation.ts    checks the query parameters
  osrmClient.ts    the only code that talks to OSRM
  concurrency.ts   limits how many OSRM calls run at once
  sorting.ts       duration first, then distance
  config.ts        settings from environment variables
  logger.ts        JSON logs, one line per event
```

A few decisions behind this:

- **TypeScript with Express and nothing else at runtime.** Strict mode is on.
  The service is small, so I kept dependencies to a minimum.
- **Everything about OSRM lives in one file.** If OSRM changes, or we move to
  another router, only `osrmClient.ts` needs to change.
- **Errors are sorted by who is at fault.** Bad input is a 400, an OSRM
  problem is a 502 or 504, and anything else is a 500 with no details leaked.
  This mapping happens in one place.
- **Dependencies are passed in** (the HTTP client, the OSRM client, the
  logger), so tests can swap in fakes. The tests are fast and run offline.
- **Logs are JSON, one line per event**, so they are easy to search and alert
  on. Skipped destinations and OSRM failures are logged with the reason.

## Built for failure

Since this would be a business-critical service depending on someone else's
server, I spent my time on what happens when that server misbehaves:

- **Timeout on every OSRM call** (3 seconds by default), so a slow OSRM cannot
  make our service hang.
- **One retry, for temporary problems only** (timeouts, network errors, 5xx).
  These calls only read data, so repeating them is safe. Malformed responses
  are not retried, because asking again will not fix them.
- **A cap on parallel OSRM calls** (5 by default). One request with 50
  destinations does not send 50 calls at once to a shared server.
- **Fail fast.** After the first OSRM failure, the request stops making new
  OSRM calls.
- **Graceful shutdown.** On SIGTERM or SIGINT the server stops taking new
  requests and finishes the running ones (10 second limit). I checked this in
  Docker with `docker stop`.
- **Settings are validated at startup.** A bad value stops the service with a
  clear message instead of failing later.
- **Docker image and CI.** The image is multi-stage, runs as a non-root user,
  and has a health check. The CI workflow type-checks, tests and builds on
  every push.

## Configuration

Everything has a default, so no setup is needed.

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `OSRM_BASE_URL` | http://router.project-osrm.org | OSRM server |
| `OSRM_TIMEOUT_MS` | 3000 | Timeout per OSRM call |
| `OSRM_MAX_RETRIES` | 1 | Extra attempts for temporary failures |
| `OSRM_RETRY_DELAY_MS` | 200 | Wait before a retry |
| `MAX_DESTINATIONS` | 50 | Max `dst` values per request |
| `MAX_CONCURRENCY` | 5 | Parallel OSRM calls per request |
| `MAX_SNAP_DISTANCE_M` | 1000 | Max distance a point may be moved to reach a road |

## Limits of this version, and what I would do next

These are in rough order of importance.

1. **Use OSRM's `table` endpoint.** Right now each destination is a separate
   call, because the assignment asks for the `route` endpoint. The `table`
   endpoint returns times and distances from one source to many destinations
   in a single call. It would be the biggest improvement for speed and for
   load on OSRM.
2. **Add a total time limit per request.** Each call has a timeout, but a
   request is not capped overall. With the defaults, 50 destinations could in
   the worst case take about a minute. I would add one deadline for the whole
   request.
3. **Run our own OSRM.** The public server has no uptime promise and a fair-use
   policy. For a business-critical service, a self-hosted OSRM inside our
   network is the right choice.
4. **Cache results.** Roads change rarely, so a short-lived cache (for example
   in Redis), with coordinates rounded so nearby points share entries, would
   cut both latency and load.
5. **Add a circuit breaker.** When OSRM is down, every request currently waits
   for the timeout. A breaker would fail immediately for a short while and let
   OSRM recover.
6. **Metrics and alerting.** Latency, error rate by type, and the number of
   skipped destinations, in something like Prometheus and Grafana. Together
   with request IDs in the logs, this makes problems easy to trace.
7. **Protect our own API.** Rate limiting per client, and authentication if
   it is not purely internal.
8. **Shortlist by straight-line distance** when the candidate list is large,
   and only ask OSRM about the closest few.

## How I used AI

I used Claude as a pair-programming partner: to talk through design choices
and edge cases, and to draft code. I read, ran and tested everything it
produced and changed what I disagreed with. The OSRM findings above come from
my own testing, and I can explain every decision in this document.