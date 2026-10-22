import type { FastifyInstance } from 'fastify';
import { createMember, createProject, createTrack } from './factories.ts';
import { createTestSession } from './session.ts';

// Maya owns a project with versions 1-3, Sam has joined it, and Olly is an outsider.
export async function shareProject(app: FastifyInstance) {
  const owner = await createTestSession(app, { name: 'Maya' });
  const collaborator = await createTestSession(app, {
    name: 'Sam',
    picture: 'https://example.com/sam.png',
  });
  const outsider = await createTestSession(app, { name: 'Olly' });
  const project = await createProject(app.db, { userId: owner.user.id });
  const tracks = [];
  for (let i = 0; i < 3; i++) {
    tracks.push(
      await createTrack(app.db, {
        userId: owner.user.id,
        projectId: project.id,
      }),
    );
  }
  const member = await createMember(app.db, {
    projectId: project.id,
    userId: collaborator.user.id,
  });
  return { owner, collaborator, outsider, project, tracks, member };
}
