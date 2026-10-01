# JuLiang-UI Stable Version Lock

Status: **LOCKED**

- 3x-ui source baseline: **v2.9.3**
- Upstream commit: `0b5c239f98fd112df10ed4846377563a391ebf60`
- Xray-core: **v26.4.25**
- Stable release tag: **juliang-v2.9.3-r2**
- Stable branch: **juliang-stable-v2.9.3**
- Upgrade/testing branch: **juliang-next**

The stable branch must not merge/rebase upstream main. Panel/core self-update is disabled. New upstream versions must be tested and released from a separate branch.

Compatibility alias: `juliang-ui-v1` is pinned to the same stable commit so existing raw installer URLs do not follow the new frontend branch. The preserved development line is `juliang-next`.


### R2.1

Release tag: `juliang-v2.9.3-r2.1`.

Fixes per-client landing outbound persistence after editing/reopening VLESS, Trojan, VMess, Shadowsocks, and Hysteria2 clients.


### R2.2

Release tag: `juliang-v2.9.3-r2.2`.

Fixes actual landing-route application by forcing Xray routing reload for clients using `outboundTag`, in addition to the R2.1 UI persistence fix.


### R2.3

Release tag: `juliang-v2.9.3-r2.3`.

- New-client emails are generated uniquely across all inbounds.
- Full Chinese `x-ui.sh` is restored.
- Installer/management helper raw downloads are pinned to the immutable R2.3 tag instead of the mutable stable branch, avoiding stale CDN branch content.


### R2.4

Release tag: `juliang-v2.9.3-r2.4`.

When adding a client, manually-entered duplicate emails are automatically suffixed (`test1` → `test1-2`, `test1-3`, ...). The email refresh button also generates a globally unique value.
