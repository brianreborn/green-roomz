#!/bin/bash
# One line into the worker log. No extra blank lines.
printf '%s\n' "$*" >> /workspace/session/console.log
