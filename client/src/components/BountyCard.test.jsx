import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import BountyCard from './BountyCard';

const bounty = {
  id: 'b1',
  title: 'Debug my Docker container',
  description: 'Exits with 137',
  tags: ['docker'],
  reward: 15,
  sessionMinutes: 120,
  status: 'open',
  postedByName: 'Asha',
  expiresAt: new Date(Date.now() + 20 * 60000).toISOString(),
};

describe('BountyCard', () => {
  test('shows reward, tags and session length', () => {
    render(<BountyCard bounty={bounty} viewerRole="mentor" />);
    expect(screen.getByText('Debug my Docker container')).toBeInTheDocument();
    expect(screen.getByText(/15/)).toBeInTheDocument();
    expect(screen.getByText('docker')).toBeInTheDocument();
    expect(screen.getByText(/2 h session/i)).toBeInTheDocument();
  });

  test('eligible mentor can accept', async () => {
    const onAccept = vi.fn();
    render(<BountyCard bounty={{ ...bounty, eligible: true }} viewerRole="mentor" onAccept={onAccept} />);
    await userEvent.click(screen.getByRole('button', { name: /accept/i }));
    expect(onAccept).toHaveBeenCalledWith('b1');
  });

  test('ineligible mentor sees a disabled button with reason', () => {
    render(<BountyCard bounty={{ ...bounty, eligible: false }} viewerRole="mentor" onAccept={() => {}} />);
    expect(screen.getByRole('button', { name: /skills don.t match/i })).toBeDisabled();
  });

  test('student owner sees cancel for open and open-room for accepted', async () => {
    const onCancel = vi.fn();
    const { rerender } = render(<BountyCard bounty={bounty} viewerRole="student" onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledWith('b1');

    rerender(<BountyCard bounty={{ ...bounty, status: 'accepted', roomId: 'r1' }} viewerRole="student" onOpenRoom={() => {}} />);
    expect(screen.getByRole('button', { name: /open room/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
  });
});
