import { redirect } from 'next/navigation';

/** App entry — route users into the roster (App Router pages handle each tab). */
export default function Home() {
  redirect('/employee-roster');
}
