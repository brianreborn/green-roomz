# Green-Roomz try VM

Bootable **Debian 12 cloud** disk + **cloud-init seed**. First boot installs Docker and runs `ghcr.io/brianreborn/green-roomz:try` on **:8080**.

## Login

- user `grz` / password `greenroomz` (try VM only — change it)
- API: `Authorization: Bearer try-local`

## QEMU

```bash
tar -xzf green-roomz-vm-kit.tar.gz
chmod +x run-qemu.sh
./run-qemu.sh
```

Wait ~2–5 minutes for first-boot cloud-init + image pull, then:

```bash
curl -s -H 'authorization: Bearer try-local' http://127.0.0.1:8080/health
ssh -p 2222 grz@127.0.0.1
```

## VirtualBox / Hyper-V

Convert if needed:

```bash
qemu-img convert -O vdi green-roomz.qcow2 green-roomz.vdi
# attach seed.iso as a DVD on first boot only
```

NAT-forward host 8080 → guest 8080.

## Build the kit (Linux CI)

```bash
sudo apt-get install -y qemu-utils cloud-image-utils
packaging/vm/build-kit.sh
```
