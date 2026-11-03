# Mock API responses (contract v2, frozen)

Real responses from the API, so the sim, UI and 3D work can build and test without a running
server. Each file passes its TypeBox schema (`src/mocks.test.ts`), and the server test
`apps/server/src/mocks.test.ts` fails if a generated file no longer matches the live API.

| File                     | Endpoint              | Request                                                                              | What it shows                                       |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `network.json`           | `GET /api/network`    | —                                                                                    | 27 stations, 35 roads, `clientId`, `serverId`       |
| `route-routed.json`      | `POST /api/route`     | `{ "disabledNodeIds": [], "disabledLinkIds": [] }`                                   | Default coastal route: 26 stations searched, 9 hops |
| `route-unreachable.json` | `POST /api/route`     | `{ "disabledNodeIds": ["sacramento", "redding", "barstow"], "disabledLinkIds": [] }` | No route: BFS explores 10 stations, empty `path`    |
| `packetize-1mib.json`    | `POST /api/packetize` | `{ "source": "file", "fileName": "essay.pdf", "sizeBytes": 1048576 }`                | 700 packets in 3 cars (234, 233, 233)               |

## Using them

```ts
import type { Network, RouteResponse } from '@netsim/shared';
import network from '@netsim/shared/mocks/network.json';
import routed from '@netsim/shared/mocks/route-routed.json';

const net = network as Network;
const route = routed as RouteResponse;
```

## Updating them

- `network.json` and `route-*.json` are generated: run `npm run mocks -w @netsim/server` after a
  topology or BFS change, and commit the result.
- `packetize-1mib.json` is `toCarPlan(1048576)` from `@netsim/shared` (the size-based plan: 1 car
  per 416.7 KB, 10 MB = 24 cars), because `POST /api/packetize` (#7) is not built yet. Once it is, add it to the generator in
  `apps/server/src/test/mocks.ts`.
- The contract is frozen: changing a response shape needs a PR approved by the contract owner and
  an announcement in the team channel.
