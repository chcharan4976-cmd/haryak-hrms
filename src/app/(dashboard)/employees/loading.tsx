export default function EmployeesLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="flex justify-between items-center mb-6">
        <div>
          <div className="h-8 w-48 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 w-64 bg-gray-200 rounded"></div>
        </div>
        <div className="h-10 w-32 bg-gray-200 rounded"></div>
      </div>
      
      <div className="h-16 w-full bg-gray-200 rounded-lg"></div>
      
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="h-12 bg-gray-100 rounded-t-lg border-b border-gray-200"></div>
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex p-4 border-b border-gray-100 items-center">
            <div className="h-10 w-10 rounded-full bg-gray-200 mr-4"></div>
            <div className="flex-1">
              <div className="h-4 w-32 bg-gray-200 rounded mb-2"></div>
              <div className="h-3 w-48 bg-gray-200 rounded"></div>
            </div>
            <div className="h-4 w-24 bg-gray-200 rounded mx-4"></div>
            <div className="h-4 w-32 bg-gray-200 rounded mx-4"></div>
            <div className="h-6 w-16 bg-gray-200 rounded mx-4"></div>
            <div className="h-4 w-24 bg-gray-200 rounded ml-4"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
