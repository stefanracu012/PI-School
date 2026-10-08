export default function LeadsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 bg-gray-200 rounded-lg w-32 mb-2"></div>
          <div className="h-5 bg-gray-200 rounded w-72"></div>
        </div>
        <div className="h-9 bg-gray-200 rounded-lg w-28"></div>
      </div>

      {/* Statistici */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
            <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
            <div className="h-7 bg-gray-200 rounded w-10"></div>
          </div>
        ))}
      </div>

      {/* Preset-uri */}
      <div className="flex gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-8 bg-gray-200 rounded-full w-20"></div>
        ))}
      </div>

      {/* Bara de căutare */}
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
        <div className="h-10 bg-gray-200 rounded-lg"></div>
      </div>

      {/* Lista */}
      <div className="space-y-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <div className="flex gap-2 mb-2">
              <div className="h-5 bg-gray-200 rounded w-36"></div>
              <div className="h-5 bg-gray-200 rounded-full w-24"></div>
              <div className="h-5 bg-gray-200 rounded-full w-20"></div>
            </div>
            <div className="h-4 bg-gray-200 rounded w-64 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-full max-w-md"></div>
          </div>
        ))}
      </div>
    </div>
  )
}
