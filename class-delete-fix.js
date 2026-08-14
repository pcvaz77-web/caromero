document.addEventListener('DOMContentLoaded', () => {
  const deleteButton = document.getElementById('deleteClass');
  if (!deleteButton) return;

  deleteButton.onclick = async () => {
    const cls = classes.find(item => item.id === selectedClassId);
    if (!cls) return;

    const isAdmin = permission.role === 'admin';
    // Turmas são estruturas que podem conter muitos alunos. Mesmo vazias,
    // somente o administrador pode removê-las; isso impede que uma permissão
    // geral de editar alunos apague uma turma inteira por engano.
    if (!isAdmin) {
      toast('Somente administradores podem excluir turmas.');
      return;
    }
    const affected = students.filter(student => student.classId === cls.id);
    if (affected.length) {
      toast(`A turma ${cls.name} não pode ser excluída porque possui ${affected.length} aluno${affected.length === 1 ? '' : 's'}. Isso protege os cadastros, fotos e históricos.`);
      return;
    }
    const message = `Excluir a turma vazia ${cls.name}? Esta ação não pode ser desfeita.`;
    if (!confirm(message)) return;

    const typedName = prompt(`Para confirmar a exclusão, digite exatamente o nome da turma: ${cls.name}`);
    if (typedName !== cls.name) {
      toast('Exclusão cancelada. O nome da turma não foi confirmado.');
      return;
    }

    deleteButton.disabled = true;
    try {
      const { error: classError } = await db.from('classes').delete().eq('id', cls.id);
      if (classError) {
        if (classError.code === '23503') throw new Error('A exclusão foi bloqueada para proteger os alunos. Execute o script supabase-delete-class-cascade.sql no Supabase antes de tentar novamente.');
        throw classError;
      }

      // Update the screen immediately; the reload then confirms the server state.
      classes = classes.filter(item => item.id !== cls.id);
      students = students.filter(student => student.classId !== cls.id);
      selectedClassId = null;
      detailStudentId = null;
      render();
      toast('Turma vazia excluída.');
      load();
    } catch (error) {
      toast(error.message || 'Não foi possível excluir a turma.');
    } finally {
      deleteButton.disabled = false;
    }
  };
});
