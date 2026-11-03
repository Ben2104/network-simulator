# Mock API responses (contract v2, frozen)

Real responses from the API, so the sim, UI and 3D work can build and test without a running
server. Each file passes its TypeBox schema (`src/mocks.test.ts`), and the server test
`apps/server/src/mocks.test.ts` fails if a generated file no longer matches the live API.

| File                     | Endpoint              | Request                                                                   | What it shows                                       |
| ------------------------ | --------------------- | ------------------------------------------------------------------------- | --------------------------------------------------- |
| `network.json`           | `GET /api/network`    | —                                                                         | 19 stations, 24 roads, `clientId`, `serverId`       |
| `route-routed.json`      | `POST /api/route`     | `{ "disabledNodeIds": [], "disabledLinkIds": [] }`                        | Default coastal route: 19 stations searched, 9 hops |
| `route-unreachable.json` | `POST /api/route`     | `{ "disabledNodeIds": ["sacramento", "redding"], "disabledLinkIds": [] }` | No route: BFS explores 10 stations, empty `path`    |
| `packetize-1mib.json`    | `POST /api/packetize` | `{ "source": "file", "fileName": "essay.pdf", "sizeBytes": 1048576 }`     | 700 packets in 24 cars (cars 0–3 carry 30, rest 29) |

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
- `packetize-1mib.json` is written by hand from the documented 1 MiB example, because
  `POST /api/packetize` (#7) is not built yet. Once it is, add it to the generator in
  `apps/server/src/test/mocks.ts`.
- The contract is frozen: changing a response shape needs a PR approved by the contract owner and
  an announcement in the team channel.
