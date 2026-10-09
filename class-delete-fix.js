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
    deleteButton.disabled = true;
    try {
      const schoolId = window.getActiveSchoolId?.();
      if (!schoolId) { toast('Selecione uma escola antes de excluir a turma.'); return; }
      const { count, error: countError } = await db.from('students')
        .select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId)
        .eq('class_id', cls.id);
      if (countError) throw countError;
      if (count === null) throw new Error('Não foi possível conferir os alunos desta turma.');
      if (count > 0) {
        toast(`A turma ${cls.name} tem ${count} aluno${count === 1 ? '' : 's'}. Remaneje os alunos antes de excluir a turma; os registros deles serão preservados.`);
        return;
      }

      if (!confirm(`Excluir a turma vazia ${cls.name}? Esta ação não pode ser desfeita.`)) return;
      const typedName = prompt(`Para confirmar a exclusão, digite exatamente o nome da turma: ${cls.name}`);
      if (typedName !== cls.name) {
        toast('Exclusão cancelada. O nome da turma não foi confirmado.');
        return;
      }

      const { data, error: classError } = await db.from('classes').delete()
        .eq('id', cls.id)
        .eq('school_id', schoolId)
        .select('id');
      if (classError) {
        if (classError.code === '23503') throw new Error('Esta turma tem vínculos com registros escolares e não pode ser excluída. Mantenha a turma para preservar esse histórico.');
        throw classError;
      }
      if (!data?.length) { toast('Turma não encontrada nesta escola ou exclusão não autorizada.'); return; }

      // Update the screen immediately; the reload then confirms the server state.
      classes = classes.filter(item => item.id !== cls.id);
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
