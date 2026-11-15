import Dexie, { type Table } from 'dexie'
import { migrate, type Project } from './model'

class EightDB extends Dexie {
  projects!: Table<Project, string>
  /** One song per project, keyed by project id. */
  audio!: Table<{ id: string; blob: Blob }, string>
  constructor() {
    super('eight')
    this.version(1).stores({ projects: 'id, updatedAt' })
    this.version(2).stores({ projects: 'id, updatedAt', audio: 'id' })
  }
}

export const db = new EightDB()

export const listProjects = () => db.projects.orderBy('updatedAt').reverse().toArray().then(all => all.map(migrate))
export const loadProject = (id: string) => db.projects.get(id).then(p => p && migrate(p))
export const saveProject = (p: Project) => db.projects.put(p)
export const deleteProject = (id: string) => Promise.all([db.projects.delete(id), db.audio.delete(id)])

export const loadAudio = (id: string) => db.audio.get(id).then(a => a?.blob)
export const saveAudio = (id: string, blob: Blob) => db.audio.put({ id, blob })
