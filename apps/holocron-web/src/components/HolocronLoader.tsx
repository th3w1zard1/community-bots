import { motion } from 'framer-motion'
import { QueryType } from '@/lib/types'

interface HolocronLoaderProps {
  queryType?: QueryType
}

const QUERY_TYPE_COLORS = {
  modding: {
    color: 'oklch(0.65 0.22 145)',
    rgb: '101, 217, 178',
    name: 'Modding',
  },
  technical: {
    color: 'oklch(0.65 0.24 25)',
    rgb: '217, 101, 101',
    name: 'Technical',
  },
  lore: {
    color: 'oklch(0.70 0.20 280)',
    rgb: '150, 120, 220',
    name: 'Lore',
  },
  general: {
    color: 'oklch(0.60 0.18 220)',
    rgb: '120, 160, 200',
    name: 'General',
  },
}

export function HolocronLoader({ queryType = 'general' }: HolocronLoaderProps) {
  const colorScheme = QUERY_TYPE_COLORS[queryType]
  
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-3">
      <div className="relative w-24 h-24" style={{ perspective: '800px' }}>
        <motion.div
          className="absolute inset-0"
          style={{
            transformStyle: 'preserve-3d',
          }}
          animate={{
            rotateY: [0, 360],
            rotateX: [0, 15, 0, -15, 0],
          }}
          transition={{
            rotateY: {
              duration: 4,
              repeat: Infinity,
              ease: 'linear',
            },
            rotateX: {
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            },
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              transformStyle: 'preserve-3d',
            }}
          >
            {[
              'translateZ(24px)',
              'translateZ(-24px)',
              'rotateY(90deg) translateZ(24px)',
              'rotateY(90deg) translateZ(-24px)',
              'rotateX(90deg) translateZ(24px)',
              'rotateX(90deg) translateZ(-24px)',
            ].map((transform, i) => (
              <div
                key={i}
                className="absolute inset-0 border-2"
                style={{
                  transform,
                  borderColor: colorScheme.color,
                  backgroundColor: `${colorScheme.color}08`,
                  boxShadow: `0 0 20px rgba(${colorScheme.rgb}, 0.4)`,
                }}
              />
            ))}
          </div>

          <motion.div
            className="absolute inset-0 flex items-center justify-center"
            animate={{
              scale: [1, 1.2, 1],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{
              transformStyle: 'preserve-3d',
            }}
          >
            <div 
              className="w-2 h-2 rounded-full shadow-[0_0_20px_8px]" 
              style={{
                backgroundColor: colorScheme.color,
                boxShadow: `0 0 20px 8px rgba(${colorScheme.rgb}, 0.5)`,
              }}
            />
          </motion.div>

          <motion.div
            className="absolute inset-2 border rounded-sm"
            style={{
              transformStyle: 'preserve-3d',
              transform: 'rotateZ(45deg)',
              borderColor: `${colorScheme.color}66`,
            }}
            animate={{
              rotateZ: [45, 405],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: 'linear',
            }}
          />

          <motion.div
            className="absolute inset-4 border rounded-sm"
            style={{
              transformStyle: 'preserve-3d',
              transform: 'rotateZ(-45deg)',
              borderColor: `${colorScheme.color}66`,
            }}
            animate={{
              rotateZ: [-45, -405],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              ease: 'linear',
            }}
          />
        </motion.div>

        <motion.div
          className="absolute -inset-2 rounded-full"
          style={{
            background: `radial-gradient(circle, rgba(${colorScheme.rgb}, 0.15) 0%, transparent 70%)`,
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>
      
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-xs uppercase tracking-widest font-bold"
        style={{ color: colorScheme.color }}
      >
        {colorScheme.name} Query
      </motion.div>
    </div>
  )
}
