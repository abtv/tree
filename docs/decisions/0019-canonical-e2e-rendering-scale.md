# Canonical E2E Rendering Scale

Status: Accepted
Date: 2026-10-05

## Context

The macOS Electron screenshot suite inherited its display's backing scale. Playwright's CSS-sized screenshot output kept image dimensions equal while glyph rasterization differed. At `b47725a`, the light strikethrough baselines failed repeatedly at startup scale 1 and passed unchanged at startup scale 2. The punctuation baseline passed at scale 1. The baseline set therefore contained images from different rendering scales.

A regression comparing repeated screenshots across consecutive scale-2 and scale-1 launches failed before the correction. Hidden versus visible windows produced identical diagnostic captures. Switching GPU rasterization changed some glyph-edge pixels but did not resolve the strikethrough baseline mismatch. The earlier session's display transitions were not observed, so these results demonstrate the scale-dependent failure rather than its historical trigger.

## Considered Alternatives

- Increase pixel tolerances or mask text. This could hide actual glyph placement, color, decoration, or caret regressions and does not remove the rendering difference.
- Change GPU rasterization. It did not correct the reproduced baseline mismatch and would change the rendering backend exercised by the suite.
- Set scale in the test entry or after window creation. Those experiments did not produce the same result as passing the scale before Electron startup.
- Generate baselines for each attached display scale. This ties baseline selection to the developer's current display and leaves the default suite environment dependent.

## Decision

Pass `--force-device-scale-factor=1` in the E2E fixture's Electron launch arguments, before the test entry. Assert the effective renderer scale after every launch. Preserve hidden and visible execution, GPU rendering, and Playwright's comparison settings.

The stability test supplies a conflicting startup scale before the canonical override to verify switch precedence and renderer behavior through the real Electron boundary. It compares exact repeated screenshots in both editing modes and appearances, and checks sensitivity to a deliberate one-pixel text translation. Serial and parallel repeat commands are maintained in `docs/DEVELOPMENT.md` §9.

## Consequences

- The suite has a canonical rendering scale without adding hooks to production code or changing the screenshot comparator.
- Only baselines inconsistent with verified canonical rendering are regenerated and visually inspected.
- Production launches and the performance fixture retain native display scaling. The E2E fixture does not establish native Retina visual correctness; product verification through the regular application covers that presentation.
- Display scale becomes an asserted launch contract. A future Electron change that stops honoring the switch fails at launch instead of producing unexplained screenshot differences.
- This refines the test environment established by ADRs 0002, 0011, and 0012; their lifecycle, visibility, and parallel isolation decisions stand.
