# Adaptyv-Nikon

This unit provides imaging functionality using NIS Elements macros. The microscope must be connected when the host starts, and must stay connected until the end of the experiment. Furthermore, NIS Elements (version 5) must be running during that time.


## Setup configuration

```yml
# Location of NIS Elements
# Defaults to 'C:\Program Files\NIS-Elements\nis_ar.exe' which should work for most setups.
nis_path: C:\Program Files\custom\location\for\nis.exe

# Bounds for X, Y and Z movements, in micrometers
# Defaults to no bounds
stage_bounds:
  x: -57000, 57000
  y: -37500, 37500
  z: 0, 6000
```


## Segment configuration

```yml
capture:
  exposure: 300 # in milliseconds
  objective: <name of the objective>
  optconf: <name of the optconf>

  # '{}' will be replaced with the chip number, starting at 0
  save: pictures/picture_{}.nd2
```
