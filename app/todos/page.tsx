'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

type Todo = { id: string; name: string };

export default function Page() {
  const [todos, setTodos] = useState<Todo[] | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('todos')
      .select()
      .then(({ data }) => setTodos(data ?? []));
  }, []);

  return (
    <ul>
      {todos?.map((todo) => (
        <li key={todo.id}>{todo.name}</li>
      ))}
    </ul>
  );
}
