import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PostBountyForm from './PostBountyForm';

describe('PostBountyForm', () => {
  test('submits a parsed bounty', async () => {
    const onSubmit = vi.fn().mockResolvedValue();
    render(<PostBountyForm balance={100} onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/title/i), 'Debug my Docker container');
    await user.type(screen.getByLabelText(/details/i), 'Exits with 137');
    await user.type(screen.getByLabelText(/skills needed/i), 'Docker, node');
    await user.clear(screen.getByLabelText(/reward/i));
    await user.type(screen.getByLabelText(/reward/i), '15');
    await user.click(screen.getByRole('button', { name: /post bounty/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Debug my Docker container',
      description: 'Exits with 137',
      tags: ['docker', 'node'],
      reward: 15,
      sessionMinutes: 120,
      acceptWindowMinutes: 30,
    });
  });

  test('blocks rewards larger than the balance', async () => {
    const onSubmit = vi.fn();
    render(<PostBountyForm balance={10} onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/title/i), 'Help');
    await user.clear(screen.getByLabelText(/reward/i));
    await user.type(screen.getByLabelText(/reward/i), '15');
    await user.click(screen.getByRole('button', { name: /post bounty/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/only have 10 tokens/i);
  });

  test('shows server errors', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Something broke'));
    render(<PostBountyForm balance={100} onSubmit={onSubmit} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/title/i), 'Help');
    await user.click(screen.getByRole('button', { name: /post bounty/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Something broke');
  });
});
