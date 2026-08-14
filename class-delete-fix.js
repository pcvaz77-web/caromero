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
    const suffix = affected.length === 1 ? '' : 's';
    const message = affected.length
      ? `Excluir a turma ${cls.name} e também os ${affected.length} aluno${suffix} cadastrado${suffix}? Esta ação não pode ser desfeita.`
      : `Excluir a turma ${cls.name}? Esta ação não pode ser desfeita.`;
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

      const photos = affected.map(student => student.photoPath).filter(Boolean);
      if (photos.length) await db.storage.from('student-photos').remove(photos);

      // Update the screen immediately; the reload then confirms the server state.
      classes = classes.filter(item => item.id !== cls.id);
      students = students.filter(student => student.classId !== cls.id);
      selectedClassId = null;
      detailStudentId = null;
      render();
      toast(affected.length ? `Turma e ${affected.length} aluno${suffix} excluído${suffix}.` : 'Turma excluída.');
      load();
    } catch (error) {
      toast(error.message || 'Não foi possível excluir a turma.');
    } finally {
      deleteButton.disabled = false;
    }
  };
});
