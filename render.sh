#!/usr/bin/env bash
apt-get update
apt-get install -y chromium-browser  # A pontos csomagnév chromium-browser
# Ellenőrizzük, hogy telepítve van-e és hol található
which chromium-browser