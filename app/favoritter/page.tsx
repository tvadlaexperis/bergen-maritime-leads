import { redirect } from 'next/navigation';

// «Favoritter» became «Arbeidsliste» — old links and bookmarks still work.
export default function FavoritesPage() {
  redirect('/arbeidsliste');
}
