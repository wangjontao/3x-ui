# JuLiang-UI Stable Version Lock

Status: **LOCKED**

- 3x-ui source baseline: **v2.9.3**
- Upstream commit: `0b5c239f98fd112df10ed4846377563a391ebf60`
- Xray-core: **v26.4.25**
- Stable release tag: **juliang-v2.9.3-r1**
- Stable branch: **juliang-stable-v2.9.3**
- Upgrade/testing branch: **juliang-next**

The stable branch must not merge/rebase upstream main. Panel/core self-update is disabled. New upstream versions must be tested and released from a separate branch.

Compatibility alias: `juliang-ui-v1` is pinned to the same stable commit so existing raw installer URLs do not follow the new frontend branch. The preserved development line is `juliang-next`.
