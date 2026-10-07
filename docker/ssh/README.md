# docker/ssh — SourceForge SSH credentials (baked into the Docker image)

Place the SSH key that is already authorized on your SourceForge account here,
so the build container can `scp` uploads without any runtime mounts.

```bash
cp ~/.ssh/id_rsa      docker/ssh/           # your SourceForge private key
cp ~/.ssh/id_rsa.pub  docker/ssh/           # optional
# optional but recommended: pin the host key so the first upload can't hang
ssh-keyscan web.sourceforge.net > docker/ssh/known_hosts
```

Then build: `docker compose up -d --build`.

## Use a dedicated key

Do not copy your everyday key. Make one that is used only for these uploads, so
it can be removed from your SourceForge account on its own if the image ever
leaks. The key has no passphrase because the container runs unattended, which
is exactly why it should be disposable:

```bash
ssh-keygen -t ed25519 -N "" -C litegapps-build -f docker/ssh/id_ed25519
```

Add `docker/ssh/id_ed25519.pub` to your SourceForge account's SSH keys. `ssh`
finds `id_ed25519` by itself, so nothing else needs configuring.

After `ssh-keyscan`, check the host key before trusting it: `ssh-keygen -lf
docker/ssh/known_hosts` prints its fingerprint, which should match the one
SourceForge publishes. A pinned key that was wrong from the start is pinned
just as firmly as a right one.

## What ends up in the image

- The real keys are gitignored (only this README is committed), but a local
  `docker build` still reads them from this directory.
- `Dockerfile` copies them to `/root/.ssh`, and `COPY . /litegapps` copies
  `docker/ssh/` (and the root `.env`) a second time, because `.dockerignore`
  excludes only `web/.env`. The private key is therefore in the image twice.
- So **keep the built image private**: never `docker push` it to a public
  registry, and treat `docker save` output like the key itself.

The web panel (`web/`) works differently and does not use this directory: it
mounts `~/.ssh` read-only at runtime and copies a single key (`SSH_KEY_NAME`)
into the container's home, so no key is baked into its image.
