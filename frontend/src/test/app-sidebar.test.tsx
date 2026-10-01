import { act, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, test } from 'vitest';

import AppSidebar from '@/layouts/AppSidebar';
import { renderWithProviders } from './test-utils';

async function renderSidebar() {
  const view = renderWithProviders(
    <MemoryRouter>
      <AppSidebar />
    </MemoryRouter>,
  );
  await act(async () => {});
  return view;
}

test('keeps the desktop sidebar permanently expanded', async () => {
  const view = await renderSidebar();
  const sidebar = view.container.querySelector('.ant-layout-sider');
  const root = view.container.querySelector('.ant-sidebar');

  expect(sidebar?.classList.contains('ant-layout-sider-collapsed')).toBe(false);
  expect(root?.classList.contains('sidebar-pinned')).toBe(true);
  expect(root?.getAttribute('style')).toContain('--sider-rail: 196px');
  expect(screen.queryByRole('button', { name: 'Pin sidebar' })).toBeNull();
});

test('uses one inbound-list entry instead of separate inbound/client menus', async () => {
  await renderSidebar();
  expect(screen.getByText('Inbounds')).not.toBeNull();
  expect(screen.queryByText('Clients')).toBeNull();
  expect(screen.queryByText('Sponsors')).toBeNull();
  expect(screen.queryByText('API Docs')).toBeNull();
});
