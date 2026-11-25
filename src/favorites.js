// Favorite stations, saved on this device.
import { useState } from 'react'

const KEY = 'tidely.favorites.v1'
const MAX = 12

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? [] } catch { return [] } }
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* ignore */ } }

export function useFavorites() {
  const [favorites, setFavorites] = useState(load)
  const update = (next) => { setFavorites(next); save(next) }
  return {
    favorites,
    isFavorite: (id) => favorites.some((f) => f.id === id),
    toggle: (station) =>
      update(
        favorites.some((f) => f.id === station.id)
          ? favorites.filter((f) => f.id !== station.id)
          : [...favorites, { id: station.id, name: station.name, state: station.state }].slice(-MAX),
      ),
  }
}
