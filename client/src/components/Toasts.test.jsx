import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Toasts from './Toasts';

describe('Toasts', () => {
  test('renders each toast with an optional action and dismiss', async () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    render(
      <Toasts
        toasts={[
          { id: 1, title: 'New bounty: Docker help', body: '15 tokens', action: { label: 'Accept', onClick: onAction } },
          { id: 2, title: 'Bounty taken' },
        ]}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getAllByRole('button', { name: /dismiss/i })[1]);
    expect(onDismiss).toHaveBeenCalledWith(2);
  });
});
