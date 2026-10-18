# Owner-operated preparation only. Agents must not execute this target.
# Keep the complete build recipe here: this file participates in the image hash.
CHROMIUM_IMAGE = $(shell node scripts/web/chromium-image.mts)

.PHONY: setup

setup:
	docker build --platform linux/arm64 -f scripts/web/chromium.Dockerfile -t "$(CHROMIUM_IMAGE)" .
