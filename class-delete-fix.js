document.addEventListener('DOMContentLoaded', () => {
  const deleteButton = document.getElementById('deleteClass');
  if (!deleteButton) return;

  deleteButton.onclick = async () => {
    const cls = classes.find(item => item.id === selectedClassId);
    if (!cls) return;

    const isAdmin = permission.role === 'admin';
    // A retirada de uma turma afeta todos os seus alunos ativos.
    // Somente o administrador da escola pode confirmar essa operação.
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
        .eq('class_id', cls.id)
        .eq('enrollment_status', 'active');
      if (countError) throw countError;
      if (count === null) throw new Error('Não foi possível conferir os alunos desta turma.');
      const message = count > 0
        ? `Retirar a turma ${cls.name} e ${count} aluno${count === 1 ? '' : 's'} das listas ativas? Ninguém será remanejado; os dados e históricos serão preservados.`
        : `Retirar a turma ${cls.name} das listas ativas? O histórico será preservado.`;
      if (!confirm(message)) return;
      const typedName = prompt(`Para confirmar a retirada, digite exatamente o nome da turma: ${cls.name}`);
      if (typedName !== cls.name) {
        toast('Retirada cancelada. O nome da turma não foi confirmado.');
        return;
      }

      const { data, error: archiveError } = await db.rpc('archive_class_and_students', {
        p_school_id: schoolId,
        p_class_id: cls.id
      });
      if (archiveError) throw archiveError;
      if (data?.class_id !== cls.id) throw new Error('Não foi possível confirmar a retirada da turma.');

      // Update the screen immediately; the reload then confirms the server state.
      classes = classes.filter(item => item.id !== cls.id);
      students = students.filter(item => item.classId !== cls.id);
      selectedClassId = null;
      detailStudentId = null;
      render();
      const archivedCount = Number(data.students_archived) || 0;
      toast(archivedCount
        ? `Turma retirada das listas ativas com ${archivedCount} aluno${archivedCount === 1 ? '' : 's'}. Histórico preservado.`
        : 'Turma retirada das listas ativas. Histórico preservado.');
      load();
    } catch (error) {
      toast(error.message || 'Não foi possível excluir a turma.');
    } finally {
      deleteButton.disabled = false;
    }
  };
});
