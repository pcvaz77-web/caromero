document.addEventListener('DOMContentLoaded', () => {
  const deleteButton = document.getElementById('deleteClass');
  if (!deleteButton) return;

  deleteButton.onclick = async () => {
    const cls = classes.find(item => item.id === selectedClassId);
    if (!cls) return;

    const affected = students.filter(student => student.classId === cls.id);
    const suffix = affected.length === 1 ? '' : 's';
    const message = affected.length
      ? `Excluir a turma ${cls.name} e também os ${affected.length} aluno${suffix} cadastrado${suffix}? Esta ação não pode ser desfeita.`
      : `Excluir a turma ${cls.name}? Esta ação não pode ser desfeita.`;
    if (!confirm(message)) return;

    deleteButton.disabled = true;
    try {
      // Remove first the dependent records. This also works when the database
      // has not yet received the optional ON DELETE CASCADE migration.
      if (affected.length) {
        const { error: studentsError } = await db.from('students').delete().eq('class_id', cls.id);
        if (studentsError) throw studentsError;
      }

      const { error: classError } = await db.from('classes').delete().eq('id', cls.id);
      if (classError) throw classError;

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
