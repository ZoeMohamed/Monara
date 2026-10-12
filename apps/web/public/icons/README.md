# Monara app icons

The User supplied `Monara-iOS-Default-1024@1x.png` on 12 October 2026 for the installed PWA and website favicon. `app-icon-source.png` preserves that file byte for byte. It is a 1024 × 1024 RGBA PNG with rounded blue/cyan tile artwork, transparent corners, and a white cat.

Source SHA-256:

```text
3ad49f72f4e2dc35ad94832dd42071cc204fcdd3e58b90242904b4f4a40d5047
```

| Asset | Size | Preparation |
| --- | --- | --- |
| `icon-192.png` | 192 × 192 | Supplied artwork resized for the PWA manifest |
| `icon-512.png` | 512 × 512 | Supplied artwork resized for the PWA manifest |
| `apple-touch-icon.png` | 180 × 180 | Supplied artwork resized for iOS home-screen installation |
| `icon-maskable-512.png` | 512 × 512 | Opaque `#3171FD` canvas, with the same artwork centered at 360 × 360 to protect the cat from launcher masks |
| `../../src/app/icon.png` | 64 × 64 | Next.js file-based browser icon |
| `../../src/app/favicon.ico` | 16, 32, and 48 pixels | Browser favicon containing three sizes |

Derived PNGs use Lanczos resampling, with no redrawing or recoloring of the supplied artwork. Layout metadata supplies the Apple touch icon; the manifest supplies ordinary and maskable PWA icons. Service worker v6 replaces v5's cached icons using the existing public asset filenames. Installed-device icon refresh remains controlled by the platform and must be checked on a phone.

The header, sidebar, and sign-in use the supplied complete lockups in `../logos`: `monara-lockup-light.svg` is blue `#3171FD` for light surfaces, and `monara-lockup-dark.svg` is white for dark surfaces. Their cat and wordmark are already part of the artwork, so no additional “Monara” text is rendered. Both files preserve the supplied `0 20.0 703.68 142.22` viewBox and paths byte for byte. Monara remains a light-only interface. The earlier standalone `logo-light.svg` and `logo-dark.svg` cat marks are retained as source assets.

`logo-1.png` is retained as the previous artwork; it is no longer used by the interface or installed icons.
