/**
 * Filtre pentru grupele încheiate.
 *
 * Capcana: în MongoDB „câmpul lipsește" nu înseamnă același lucru cu „câmpul
 * e null". Grupele create înainte să existe `completedAt` n-au deloc câmpul,
 * iar o căutare după `completedAt: null` nu le prinde — așa că lista de grupe,
 * orarul și paginile profesorului ieșeau goale.
 *
 * De aceea „grupă în curs" întreabă de amândouă: câmp lipsă sau câmp null
 * (cazul unei grupe redeschise, care chiar are null scris în el).
 */

/** Grupele care nu sunt încheiate — cele de zi cu zi. */
export const NOT_COMPLETED = {
  OR: [{ completedAt: null }, { completedAt: { isSet: false } }],
}

/** Grupele încheiate. */
export const IS_COMPLETED = {
  completedAt: { isSet: true, not: null },
}
