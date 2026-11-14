import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Network, RouteResponse } from '@netsim/shared';
import mockNetwork from '@netsim/shared/mocks/network.json';
import { RouteCard } from './Sidebar';
import { LiveNetwork } from './LiveNetwork';
import { RoutingControls } from './RoutingControls';

const network = mockNetwork as Network;
const route: RouteResponse = {
  status: 'routed',
  path: ['csulb', 'el-segundo'],
  linkPath: ['csulb--el-segundo'],
  totalCost: 1,
  visitOrder: [{ nodeId: 'csulb', parentId: null, viaLinkId: null, depth: 0, cost: 0 }],
};

describe('algorithm-specific route display', () => {
  it('shows BFS hops/FIFO without showing bandwidth cost even when supplied by the API', () => {
    const html = renderToStaticMarkup(
      <RouteCard
        network={network}
        route={{ ...route, algorithm: 'bfs' }}
        algorithm="bfs"
        phase="delivered"
        visitedCount={1}
        apiError={null}
      />,
    );
    expect(html).toContain('Route (BFS)');
    expect(html).toContain('1 hops');
    expect(html).toContain('FIFO');
    expect(html).not.toContain('Total route cost');
  });
  it('shows total cost and settled order for Dijkstra', () => {
    const html = renderToStaticMarkup(
      <RouteCard
        network={network}
        route={{ ...route, algorithm: 'dijkstra' }}
        algorithm="dijkstra"
        phase="delivered"
        visitedCount={1}
        apiError={null}
      />,
    );
    expect(html).toContain('Route (Dijkstra)');
    expect(html).toContain('Total route cost');
    expect(html).toContain('1.00');
    expect(html).toContain('Settled order');
    expect(html).not.toContain('FIFO');
  });
  it('shows the AS path, policy note and cost for BGP', () => {
    const html = renderToStaticMarkup(
      <RouteCard
        network={network}
        route={{ ...route, algorithm: 'bgp', asPath: [64512, 64520, 64550, 64560] }}
        algorithm="bgp"
        phase="delivered"
        visitedCount={1}
        apiError={null}
      />,
    );
    expect(html).toContain('Route (BGP)');
    expect(html).toContain('AS path');
    expect(html).toContain('AS64520 SoCal Metro → AS64550 Desert Carrier');
    expect(html).toContain('business policy first');
    expect(html).toContain('Total route cost');
  });
  it('explains a BGP policy dead end', () => {
    const html = renderToStaticMarkup(
      <RouteCard
        network={network}
        route={{
          status: 'unreachable',
          path: [],
          linkPath: [],
          visitOrder: route.visitOrder,
          algorithm: 'bgp',
          asPath: null,
          totalCost: null,
        }}
        algorithm="bgp"
        phase="noRoute"
        visitedCount={1}
        apiError={null}
      />,
    );
    expect(html).toContain('policy does not allow them');
  });
  it('lists the AS agreements only in BGP mode', () => {
    const controls = (algorithm: 'bfs' | 'bgp') =>
      renderToStaticMarkup(
        <RoutingControls
          algorithm={algorithm}
          locked={false}
          onChange={() => {}}
          onResetBandwidths={() => {}}
          customized={0}
        />,
      );
    expect(controls('bgp')).toContain('Autonomous Systems and agreements');
    expect(controls('bgp')).toContain('SoCal Metro ⇄ Desert Carrier · peers');
    expect(controls('bgp')).toContain('Reset bandwidths');
    expect(controls('bfs')).not.toContain('Autonomous Systems');
    expect(controls('bfs')).toContain('BGP · AS policy');
  });
});

describe('bandwidth controls are exclusive to Dijkstra', () => {
  it.each(['bfs', 'dijkstra'] as const)('renders appropriate controls for %s', (algorithm) => {
    const controls = renderToStaticMarkup(
      <RoutingControls
        algorithm={algorithm}
        locked={false}
        customized={1}
        onChange={() => {}}
        onResetBandwidths={() => {}}
      />,
    );
    const roads = renderToStaticMarkup(
      <LiveNetwork
        onRoadPreview={() => {}}
        onNodePreview={() => {}}
        network={network}
        algorithm={algorithm}
        bandwidths={{ 'csulb--el-segundo': 100 }}
        settingsLocked={false}
        routeLinks={[]}
        onBandwidth={() => {}}
        nodes={new Set()}
        links={new Set()}
        busy={false}
        changes={0}
        onToggle={() => {}}
        onRestore={() => {}}
      />,
    );
    if (algorithm === 'bfs') {
      expect(controls).not.toContain('Mbps');
      expect(roads).not.toContain('Mbps');
      expect(roads).not.toContain('>Edit<');
    } else {
      expect(controls).toContain('Mbps');
      expect(roads).toContain('Mbps');
      expect(roads).toContain('>Edit<');
    }
  });
});
