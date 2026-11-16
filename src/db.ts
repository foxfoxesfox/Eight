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
export const deleteProject = (id: string) => Promise.all([db.projects.delete(id), db.audio.delete(id), db.audio.delete(id + ':wave')])

export const loadAudio = (id: string) => db.audio.get(id).then(a => a?.blob)
export const saveAudio = (id: string, blob: Blob) => db.audio.put({ id, blob })

// A song's waveform, kept for a video whose own sound is too big or too rough to draw. It shares the audio table under its own key, so no storage upgrade is needed.
export const saveWave = (id: string, peaks: Float32Array) => db.audio.put({ id: id + ':wave', blob: new Blob([peaks.buffer as ArrayBuffer]) })
export const loadWave = (id: string) => db.audio.get(id + ':wave').then(async a => a && new Float32Array(await a.blob.arrayBuffer()))
