# Pickup Routes Service

A small web service that takes a source location and a list of pickup points,
and returns the drive time and distance to each, nearest first.

## Assumptions

- Coordinates are `longitude,latitude` (matches the examples and OSRM).
- Exactly one `src` and at least one `dst` are required, otherwise 400.
- At most 50 `dst` values (the public OSRM server is shared). Duplicates are removed.
- Sorted by duration, then distance in cases of equal duration. 
- A destination OSRM cannot route to is left out of the response and logged.
- OSRM snaps points to the nearest road. A destination snapped further than
  1000 m (`MAX_SNAP_DISTANCE_M`) is treated as unroutable.
- If OSRM itself is down or too slow, the whole request fails (502/504).
  A partial list could name the wrong "nearest" pickup point.

## Findings while testing OSRM

- The host in the assignment PDF (`router.projectosrm.org`) does not resolve.
  I use `router.project-osrm.org` instead.
- OSRM returns `"code":"Ok"` even for a point in the ocean, by snapping it to
  a road about 1,770 km away. Hence the snap-distance check above.