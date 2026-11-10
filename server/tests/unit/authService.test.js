const { createTestContext } = require('../helpers/context');

describe('AuthService', () => {
  let ctx;
  beforeEach(() => {
    ctx = createTestContext();
  });

  test('register a student gives starter tokens and returns a token', async () => {
    const { user, token } = await ctx.services.auth.register({
      name: 'Asha', email: 'asha@example.com', password: 'secret123', role: 'student',
    });
    expect(user).toMatchObject({ name: 'Asha', role: 'student', tokens: 100 });
    expect(user.passwordHash).toBeUndefined();
    expect(typeof token).toBe('string');
  });

  test('register a mentor normalises skills and starts with 0 tokens', async () => {
    const { user } = await ctx.services.auth.register({
      name: 'Ravi', email: 'ravi@example.com', password: 'secret123', role: 'mentor',
      skills: [' Docker ', 'NODE', 'docker'],
    });
    expect(user.skills).toEqual(['docker', 'node']);
    expect(user.tokens).toBe(0);
  });

  test.each([
    [{ email: 'a@b.com', password: 'secret123', role: 'student' }, /name/i],
    [{ name: 'A', email: 'not-an-email', password: 'secret123', role: 'student' }, /email/i],
    [{ name: 'A', email: 'a@b.com', password: '123', role: 'student' }, /password/i],
    [{ name: 'A', email: 'a@b.com', password: 'secret123', role: 'admin' }, /role/i],
    [{ name: 'A', email: 'a@b.com', password: 'secret123', role: 'mentor', skills: [] }, /skill/i],
  ])('register validates input %#', async (input, msg) => {
    await expect(ctx.services.auth.register(input)).rejects.toMatchObject({ status: 400, message: expect.stringMatching(msg) });
  });

  test('register rejects a duplicate email with 409', async () => {
    const input = { name: 'A', email: 'a@b.com', password: 'secret123', role: 'student' };
    await ctx.services.auth.register(input);
    await expect(ctx.services.auth.register(input)).rejects.toMatchObject({ status: 409 });
  });

  test('login with correct credentials returns token; wrong password is 401', async () => {
    await ctx.services.auth.register({ name: 'A', email: 'a@b.com', password: 'secret123', role: 'student' });
    const { token } = await ctx.services.auth.login({ email: 'A@B.com', password: 'secret123' });
    expect(token).toBeTruthy();
    await expect(ctx.services.auth.login({ email: 'a@b.com', password: 'nope' })).rejects.toMatchObject({ status: 401 });
    await expect(ctx.services.auth.login({ email: 'x@b.com', password: 'nope' })).rejects.toMatchObject({ status: 401 });
  });

  test('verifyToken returns the user id and role; garbage is 401', async () => {
    const { user, token } = await ctx.services.auth.register({ name: 'A', email: 'a@b.com', password: 'secret123', role: 'student' });
    expect(ctx.services.auth.verifyToken(token)).toEqual({ id: user.id, role: 'student' });
    expect(() => ctx.services.auth.verifyToken('garbage')).toThrow(expect.objectContaining({ status: 401 }));
  });
});
