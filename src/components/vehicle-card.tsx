import { Vehicle } from '@/types/autolog';
import { Gauge, Calendar, Clock } from 'lucide-react';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { differenceInDays, parseISO } from 'date-fns';

export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const displayImage = vehicle.mainImage || (vehicle.imageUrls && vehicle.imageUrls.length > 0 
    ? vehicle.imageUrls[0] 
    : vehicle.imageUrl || "https://picsum.photos/seed/car/800/600");

  const serviceDiff = vehicle.nextServiceDate ? differenceInDays(parseISO(vehicle.nextServiceDate), new Date()) : null;

  return (
    <div className="relative overflow-hidden rounded-2xl glass-card">
      <div className="h-48 relative bg-secondary">
        <Image 
          src={displayImage}
          alt={`${vehicle.make} ${vehicle.model}`}
          fill
          className="object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-card to-transparent" />
        <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
          <div>
            <h2 className="text-4xl font-headline font-bold">{vehicle.make}</h2>
            <p className="text-xl font-headline font-medium opacity-80">{vehicle.model}</p>
          </div>
          <div className="bg-white text-black font-bold px-4 py-1 rounded text-lg border-2 border-slate-300">
            {vehicle.licensePlate}
          </div>
        </div>
        {serviceDiff !== null && serviceDiff < 30 && (
          <div className="absolute top-4 right-4 animate-pulse">
            <Badge variant="destructive" className="shadow-lg">
              <Clock className="w-3 h-3 mr-1.5" /> Service snart!
            </Badge>
          </div>
        )}
      </div>
      
      <div className="p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Mätarställning</p>
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-primary" />
            <span className="text-xl font-bold">{vehicle.currentOdometerReading.toLocaleString()} mil</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Årsmodell</p>
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-accent" />
            <span className="text-lg font-medium">{vehicle.year}</span>
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Service Status</p>
          <div className="flex items-center gap-2">
            {vehicle.nextServiceDate ? (
              <span className={`text-sm font-bold ${serviceDiff && serviceDiff < 30 ? 'text-destructive' : 'text-green-500'}`}>
                {vehicle.nextServiceDate}
              </span>
            ) : (
              <span className="text-xs opacity-50 italic">Ej planerad</span>
            )}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Historik</p>
          <div className="flex items-center gap-2 text-primary font-bold">
            <Badge variant="outline" className="text-primary border-primary/30">
              Premium
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}