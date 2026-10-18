.DEFAULT_GOAL := help

# Owner-operated preparation only. Agents must not execute these build targets.
CHROMIUM_IMAGE = $(shell node scripts/web/chromium-image.mts)

.PHONY: help chromium-image chromium-image-rebuild

help:
	@echo "make chromium-image          Build Chromium dependencies (network required)"
	@echo "make chromium-image-rebuild  Refresh the base image and rebuild dependencies"
	@echo "npm run test:web:chromium    Run tests offline in the prepared image"

chromium-image:
	docker build --platform linux/arm64 -f scripts/web/chromium.Dockerfile -t "$(CHROMIUM_IMAGE)" .

chromium-image-rebuild:
	docker build --pull --no-cache --platform linux/arm64 -f scripts/web/chromium.Dockerfile -t "$(CHROMIUM_IMAGE)" .
