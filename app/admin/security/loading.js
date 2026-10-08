export default function SecurityLoading() {
  return (
    <div className="space-y-6 animate-pulse max-w-2xl">
      <div>
        <div className="h-7 w-40 bg-gray-200 rounded-lg mb-2" />
        <div className="h-4 w-64 bg-gray-200 rounded" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="h-5 w-32 bg-gray-200 rounded" />
        <div className="h-10 bg-gray-100 rounded-xl" />
        <div className="h-10 bg-gray-100 rounded-xl" />
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="h-5 w-40 bg-gray-200 rounded" />
        <div className="h-24 bg-gray-100 rounded-xl" />
      </div>
    </div>
  )
}
