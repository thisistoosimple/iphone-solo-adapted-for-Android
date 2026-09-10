# iPhone Solo

The iPhone Duo fold animation for phones that do not fold.

When the Duo opens or closes,
the picture on its screen stays where it is in space
while the hardware sweeps through it:
the image frosts over and slips into black
without ever changing its size.
iPhone Solo does the same thing on a regular iPhone,
driven by gravity instead of a hinge.
Hold the phone flat, screen to the sky, and the picture is sharp.
Roll it left or right, like closing a book,
and the display folds away from the edge you lift.

On a laptop the hinge is real.
The fold hangs from the top edge of the screen
and grows from the bottom as the lid comes down.

## Install

1. Host the folder anywhere that serves it over HTTPS
   (motion access needs a secure origin).
2. Open it in Safari on the iPhone and allow motion when asked.
3. Share → Add to Home Screen.
4. Launch it from the icon for an edge to edge window.

The page also runs in a Safari tab,
where a Fullscreen pill explains the steps above.

## On a MacBook

Chrome can talk to the lid angle sensor directly through WebHID,
so nothing needs to be installed.
That path only gets a tick about once a second.

For a fold that follows the hinge at sixty frames a second,
run the local stream (it polls the HID feature report):

    python3 bridge/lid-bridge.py --serve

Then open `http://127.0.0.1:3000/` (or point the Cloudflare tunnel at it).
The page reads `/lid` from the same origin.
`--serve` also keeps `127.0.0.1:8471/lid` for a tab opened elsewhere.

1. Open the site in Chrome (or another Chromium browser) on the Mac.
2. If the stream is not running, click **Allow lid sensor**
   and pick the Apple device in Chrome's list.
3. Close the lid slowly.

The fold maps lid degrees to turn 0–1.
`FOLD_OPEN` and `FOLD_CLOSED` in `laptop.js` set that span.
Leave `FOLD_OPEN` at `0` to use the widest angle seen
(a fully open lid). Raise it, e.g. `110`, to start folding
only after the lid has already come down that far.
`FOLD_CLOSED` is where the picture is fully gone
(default `15`). The sensor ships in MacBooks from 2019 on.

Safari and Firefox have no WebHID.
The opening sheet walks through the helper:
download `lid-bridge.py` and run it in Terminal.
The page picks up `127.0.0.1:8471/lid` on its own.
Trackpad preview remains as a fallback.
The Fullscreen pill uses the real fullscreen API here.

### The bridge

`bridge/lid-bridge.py` polls the lid with HID feature reports
and streams the angle on `/lid` sixty times a second.
Run it with `python3 lid-bridge.py`.
On first launch it creates a private virtualenv
under `~/Library/Application Support/iPhone Solo`
and installs `hidapi` there,
which sidesteps Homebrew's externally-managed-environment error.

`--serve` hosts the site on port 3000 as well,
so a tunnel or a local tab can use the high-rate stream
without a second process. The page tries same-origin `/lid`
first, then `127.0.0.1:8471/lid`, then WebHID.

Device detection is a fine pointer with no touch points.
Append `?mode=laptop` or `?mode=phone` to force either.

## Controls

Pills at the top of the screen:

- **Choose image** — pick a photo from the library
- **Use default** — go back to `backgrounds/default.png`
  (shown only while a custom photo is set)
- **Fullscreen** and **GitHub** — shown only in a browser tab

Tap the picture to hide or show the pills.
They stay visible until a custom photo is chosen,
after that they start hidden.

## Backgrounds

The default pictures live in `backgrounds/`:
`default.png` for phones and `default-mac.jpg` for laptops.
To ship different ones, replace those files
or change `defaultImage` in `phone.js` and `laptop.js`.
Use a screenshot at the device's native resolution;
the blur is sampled from the image's own mip chain,
so a small picture goes soft sooner.
A photo chosen on the device is stored in IndexedDB,
separately per mode, and used until *Use default* is tapped.
Images are drawn with cover, so nothing is stretched
and there are no borders.

## How it works

Everything is drawn on a WebGL 2 canvas.
`gl.js` owns the shared stage: context, quad,
texture upload, the Gaussian mip chain built once per image,
cover mapping and the sampling helper.
The canvas is treated as the physical display:
each pixel is projected into a stationary image plane
that rotates about a hinge, with perspective,
so the span across the hinge stays painted
and only the margins along it open up.
Blur grows with the tilt and with the distance from the hinge,
then a glass tint, a faint reflection
and a black fade toward the far edge finish it,
and the geometry stops bending once the picture
would stretch past `MAX_STRETCH`.

The two folds are separate shaders:
`fold.js` puts the hinge on the left or right edge for phones,
`lid.js` puts it along the top edge for laptops.
`phone.js` reads gravity from `devicemotion`,
turns it into a roll angle, doubles it
and clamps it to a half turn.
`laptop.js` reads the lid angle from the 60 Hz feature-report stream
when one is running, then WebHID, then the trackpad.
Both ease toward their target every frame
and hand `app.js` a small scene object,
which keeps the hints, sheets, controls and render loop shared.

The guides are `<dialog>` sheets styled in `styles.css`,
each ending with a credit to
[Archie Auburn](https://www.instagram.com/archieauburn/).
