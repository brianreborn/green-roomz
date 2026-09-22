# Fresh checkout on a fast machine

This Athlon II does about 1.6 tokens/second. Do the next dogfood there only to edit code. Run the model on the fastest box you still have SuperGrok time to drive.

`main` does not have the dogfood command. Use `disclosure-acceptance`.

```text
git clone https://github.com/brianreborn/green-roomz.git
cd green-roomz
git checkout disclosure-acceptance
```

Windows: `powershell -File scripts/with-fleet.ps1`  
Anything else: `sh scripts/with-fleet.sh`

That clones `green-agentz` beside this repo. It does not copy Brainz into Roomz.

```text
GREEN_BRAINZ_ROOT=<parent>/green-agentz/systems/green-brainz
```

Then serve, and one dry-run:

```text
node bin/green-roomz.mjs dogfood --goal "..."
```

Set `GRZ_DOGFOOD_MODEL` to whichever alias is already warm. Apply only with `GRZ_DOGFOOD_APPLY=1`. A diff that recreates an existing file is refused.

What that second checkout contains:

- `systems/green-brainz` — memory loop, IRQ, scheduler
- `skills/` — Green-Zkillz
- Shepherdz is still the monitor inside Roomz, not its own repo

Out of the fleet: `max-headroom-grok`, and the retired `green-agency` name. Weights and `llama-server` stay on the machine; they are not another git repo.
