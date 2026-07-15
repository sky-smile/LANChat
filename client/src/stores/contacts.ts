import { create } from 'zustand';

export interface Contact {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  department?: string;
  status: 'online' | 'away' | 'busy' | 'offline';
}

export interface Group {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  memberCount: number;
  type: 'normal' | 'department' | 'announcement';
}

interface ContactsState {
  contacts: Contact[];
  groups: Group[];
  setContacts: (contacts: Contact[]) => void;
  setGroups: (groups: Group[]) => void;
  updateContactStatus: (id: string, status: Contact['status']) => void;
}

export const useContactsStore = create<ContactsState>((set) => ({
  contacts: [],
  groups: [],

  setContacts: (contacts) => {
    set({ contacts });
  },

  setGroups: (groups) => {
    set({ groups });
  },

  updateContactStatus: (id, status) => {
    set((state) => ({
      contacts: state.contacts.map((contact) =>
        contact.id === id ? { ...contact, status } : contact,
      ),
    }));
  },
}));
