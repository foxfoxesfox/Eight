import Dexie, { type Table } from 'dexie'
import type { Project } from './model'

class EightDB extends Dexie {
  projects!: Table<Project, string>
  constructor() {
    super('eight')
    this.version(1).stores({ projects: 'id, updatedAt' })
  }
}

export const db = new EightDB()

export const listProjects = () => db.projects.orderBy('updatedAt').reverse().toArray()
export const loadProject = (id: string) => db.projects.get(id)
export const saveProject = (p: Project) => db.projects.put(p)
export const deleteProject = (id: string) => db.projects.delete(id)
