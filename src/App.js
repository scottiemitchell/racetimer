import React, { useState, useRef, useEffect, useCallback } from 'react';
import './index.css';
//import raceTimerBackground from './RaceTimerBackground.png';
import raceTimerBackground from './images/race-background.png';
import birdsImage from './images/Birds.png';
import bgMusic from './audio/khoyu-hui-dhun.mp3';
import countdownMusic from './audio/countdown.mp3'; // Add new countdown music import
import starterPistolSound from './audio/starter-gun.mp3';
import stopwatchImage from './images/Stopwatch.png'
import runningSoundFile from './audio/running-sound.mp3';
// Replace the fancy card components with basic divs, or if you want to keep the UI components,
// we can create simplified versions:


// We create a larger pool of runners with varying speeds
const createRunners = (count) => {
  const colors = ['#FF0000', '#06b52e', '#0000FF', '#FF00FF', '#e8e810', '#00FFFF', '#FF8800', '#8800FF'];
  const names = [
    'Alice Smith', 'Bob Johnson', 'Carol Davis', 'David Wilson',
    'Emma Brown', 'Frank Miller', 'Grace Taylor', 'Henry Moore'
  ];
  
  return colors.slice(0, count).map((color, index) => {
    // Increase speed variation range
    const baseSpeed = 1.5 + (Math.random() * 0.8); // Base speed varies between 1.5 and 2.3
    const speedVariations = [];
    const variationPoints = 30; // Increased variation points for more frequent changes
    
    // Generate more dramatic speed variations, but without random jitter
    for (let i = 0; i < variationPoints; i++) {
      speedVariations.push({
        distance: (i / variationPoints) * 100,
        // Speed varies within ±30% of base speed, smoothly
        multiplier: 1 + (Math.sin(i * Math.PI / 2) * 0.3)
      });
    }

    // Reduce frequency of lane changes and add bias towards lane 1
    const laneVariations = [];
    const laneVariationPoints = 10; // Reduced from 40 for less frequent changes
    
    for (let i = 0; i < laneVariationPoints; i++) {
      const distancePoint = (i / laneVariationPoints) * 100;
      laneVariations.push({
        distance: distancePoint,
        // After first lap (distance > 100), bias towards bottom lane
        offset: (lap) => {
          if (lap === 0) {
            // In first lap, stay mostly in assigned lane with small variations
            return Math.sin(i * Math.PI / 2) * 0.5;
          } else {
            // After first lap, tend towards bottom lanes
            const lanePreference = Math.max(0, index - (lap * 2));
            return lanePreference + (Math.sin(i * Math.PI / 2) * 0.5);
          }
        }
      });
    }

    return {
      id: index + 1,
      name: names[index],
      number: index + 1,
      color: color,
      splits: [],
      baseSpeed,
      speedVariations,
      laneVariations, // Add lane variations to runner object
      bodyParts: [
        { offsetX: 10, offsetY: -10, size: 7 + Math.random() },
        { offsetX: 5, offsetY: 0, size: 11 + Math.random() },
        { offsetX: 0, offsetY: 10, size: 7 + Math.random() }
      ],
      getPosition: (t) => {
        const speed = baseSpeed;
        let totalDistance = 0;
        
        // Calculate distance with varying speeds
        const timeSegments = Math.floor(t);
        for (let i = 0; i < timeSegments; i++) {
          const lapProgress = (totalDistance % 100) / 100;
          const variationIndex = Math.floor(lapProgress * variationPoints);
          const variation = speedVariations[variationIndex];
          totalDistance += speed * variation.multiplier * 1.5;
        }
        
        // Add partial segment
        const remainder = t - timeSegments;
        if (remainder > 0) {
          const lapProgress = (totalDistance % 100) / 100;
          const variationIndex = Math.floor(lapProgress * variationPoints);
          const variation = speedVariations[variationIndex];
          totalDistance += speed * variation.multiplier * remainder * 0.6;
        }

        const lap = Math.floor(totalDistance / 100);
        const lapProgress = totalDistance % 100;
        
        // Calculate lane position with modified variations
        const laneVariationIndex = Math.floor(lapProgress * laneVariationPoints / 100);
        const laneVariation = laneVariations[laneVariationIndex];
        const baseY = 20 + (index * 10);
        // Apply lane variation based on current lap
        const adjustedY = baseY - (laneVariation.offset(lap) * 10);
        
        return {
          x: 100 - lapProgress,
          y: adjustedY,
          lap,
          legPhase: Math.sin(t * 2 + index), // Increased leg movement frequency
          totalDistance
        };
      }
    };
  });
};

const TOTAL_LAPS = 8;
const FINISH_LINE_X = 25;
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 175; // Increased height for more runners
const SLICE_WIDTH = 2;
const RUNNER_SIZE = 10; // Increase runner size
const BIB_FONT_SIZE = '18px'; // Set the desired font size for live cam view
const BIB_TEXT_COLOR = 'green'; // set the color of the bib numbers for live cam view
const GAME_DURATION = 120; // 2 minutes in seconds
const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// Move ResultsTable outside of PhotoFinishSystem
const ResultsTable = ({ 
  runners, 
  splits, 
  onDeleteSplit, 
  selectedRunner, 
  onRunnerSelect,
  deletedSplits,
  totalLaps 
}) => {
  // Helper function to get all splits for a runner, including deleted ones
  const getRunnerSplits = (bibNumber) => {
    return splits
      .filter(split => split.bibNumber === bibNumber)
      .map(split => ({
        ...split,
        isDeleted: deletedSplits.has(split.id)
      }))
      .sort((a, b) => a.time - b.time);
  };

  // Helper function to get the effective splits (excluding deleted ones)
  const getEffectiveSplits = (bibNumber) => {
    return getRunnerSplits(bibNumber).filter(split => !split.isDeleted);
  };

  // Update the getLastTime function
  const getLastTime = (effectiveSplits) => {
    if (effectiveSplits.length === 0) return null;
    // Show finish time if we have at least totalLaps splits
    return effectiveSplits.length >= totalLaps ? effectiveSplits[effectiveSplits.length - 1].time : null;
  };

  // Add function to calculate last split time
  const getLastSplitTime = (effectiveSplits) => {
    if (effectiveSplits.length === 0) return null;
    if (effectiveSplits.length === 1) {
      // If only one split, show cumulative time from start
      return effectiveSplits[0].time;
    }
    // Otherwise show difference between last two splits
    return effectiveSplits[effectiveSplits.length - 1].time - effectiveSplits[effectiveSplits.length - 2].time;
  };

  // Update the sorting logic to handle deleted splits properly
  const sortedRunners = [...runners].sort((a, b) => {
    const aEffectiveSplits = getEffectiveSplits(a.number);
    const bEffectiveSplits = getEffectiveSplits(b.number);
    
    // First, compare by number of effective splits
    if (bEffectiveSplits.length !== aEffectiveSplits.length) {
      return bEffectiveSplits.length - aEffectiveSplits.length;
    }
    
    // If same number of splits, compare by last split time
    if (aEffectiveSplits.length > 0 && bEffectiveSplits.length > 0) {
      return aEffectiveSplits[aEffectiveSplits.length - 1].time - 
             bEffectiveSplits[bEffectiveSplits.length - 1].time;
    }
    
    // If no splits, maintain original bib number order
    return a.number - b.number;
  });

  // Update the getSplitsRemaining function
  const getSplitsRemaining = (bibNumber) => {
    const effectiveSplits = getEffectiveSplits(bibNumber);
    return Math.max(0, totalLaps - effectiveSplits.length); // Just use totalLaps, not multiplied by 2
  };

  // Update handleRowClick to use the prop function
  const handleRowClick = (runnerNumber) => {
    onRunnerSelect(runnerNumber);
  };

  // Add function to get the last split for a runner
  const getLastSplitId = (bibNumber) => {
    const runnerSplits = splits
      .filter(split => split.bibNumber === bibNumber && !deletedSplits.has(split.id))
      .sort((a, b) => b.time - a.time); // Sort by time descending
    return runnerSplits.length > 0 ? runnerSplits[0].id : null;
  };

  return (
    <div className="h-full bg-gray-900 rounded-lg border border-gray-700">
      <div className="p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-white">Race Results</h3>
      </div>
      <div className="overflow-auto h-[calc(100%-4rem)]">
        <table className="w-full text-sm text-gray-200">
          <thead className="sticky top-0 bg-gray-800">
            <tr className="border-b border-gray-700">
              <th className="text-left p-3 font-semibold">Bib</th>
              <th className="text-left p-3 font-semibold">Name</th>
              <th className="text-right p-3 font-semibold">Last Time</th>
              <th className="text-right p-3 font-semibold">Last Split</th>
              <th className="text-right p-3 font-semibold">Splits Left</th>
              <th className="text-right p-3 font-semibold">Finish</th>
            </tr>
          </thead>
          <tbody>
            {sortedRunners.map(runner => {
              const allSplits = getRunnerSplits(runner.number);
              const effectiveSplits = getEffectiveSplits(runner.number);
              const splitsRemaining = getSplitsRemaining(runner.number);
              const isSelected = selectedRunner === runner.number;
              const finishTime = getLastTime(effectiveSplits);
              const lastSplitTime = getLastSplitTime(effectiveSplits);
              const lastSplitId = getLastSplitId(runner.number);

              return (
                <React.Fragment key={runner.id}>
                  <tr 
                    className={`border-b border-gray-700 hover:bg-gray-800 clickable-row
                      ${isSelected ? 'bg-gray-700' : ''}`}
                    onClick={() => handleRowClick(runner.number)}
                    role="button"
                    tabIndex={0}
                  >
                    <td className="p-3">
                      <div className="flex items-center space-x-2" style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px'
                      }}>
                        <div style={{ 
                          width: '12px', 
                          height: '12px', 
                          borderRadius: '50%', 
                          backgroundColor: runner.color,
                          border: '1px solid rgba(255,255,255,0.3)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                        }}></div>
                        <span style={{ fontWeight: 'bold' }}>#{runner.number}</span>
                      </div>
                    </td>
                    <td className="p-3">{runner.name}</td>
                    <td className="text-right p-3 font-mono">
                      {effectiveSplits.length > 0 ? formatTime(effectiveSplits[effectiveSplits.length - 1].time) : '-'}
                    </td>
                    <td className="text-right p-3 font-mono">
                      {lastSplitTime !== null ? (
                        <span>
                          {formatTime(lastSplitTime)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-right p-3" style={{ 
                      padding: 0,
                      height: '100%',
                      position: 'relative',
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center', 
                        justifyContent: 'space-between',
                        width: '100%',
                        height: '100%',
                        padding: '8px 16px',
                        boxSizing: 'border-box',
                      }}>
                        {splitsRemaining}
                        {lastSplitId && (
                          <div 
                            style={{ 
                              cursor: 'pointer',
                              fontSize: '14px',
                              color: '#f44336',
                              fontWeight: 'bold',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                             // borderLeft: '1px solid rgba(158, 158, 158, 0.3)',
                              paddingLeft: '8px',
                              marginLeft: '8px',
                              height: '100%',
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSplit(lastSplitId);
                            }}
                            title="Delete last split"
                          >
                            ×
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="text-right p-3 font-mono">
                      {finishTime !== null ? (
                        <span className="text-green-400">
                          {formatTime(finishTime)}
                        </span>
                      ) : '-'}
                    </td>
                  </tr>
                  {isSelected && (
                    <tr 
                      className="bg-gray-800"
                      onClick={e => e.stopPropagation()}
                    >
                      <td colSpan="6" className="p-4">
                        <div className="text-sm">
                          <h4 className="font-semibold mb-2">Split History</h4>
                          {allSplits
                            .filter(split => !split.isDeleted)
                            .map((split, idx) => (
                              <div 
                                key={split.id} 
                                className="flex justify-between items-center p-2"
                              >
                                <span>Split {idx + 1}: {formatTime(split.time)}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteSplit(split.id);
                                  }}
                                  className="text-red-400 hover:text-red-300"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Add these constants at the top
const DIFFICULTY_SETTINGS = {
  easy: {
    runners: 4,
    laps: 4,
    duration: 180, // 3 minutes
  },
  medium: {
    runners: 6,
    laps: 6,
    duration: 120, // 2 minutes
  },
  hard: {
    runners: 8,
    laps: 8,
    duration: 120, // 2 minutes
  }
};

// Add this new component before DifficultySelector
const Birds = () => {
  const [birds, setBirds] = useState([]);
  const animationFrameRef = useRef();

  // Create a bird
  const createBird = () => {
    const direction = Math.random() > 0.5 ? 1 : -1; // 1 for right, -1 for left
    const angle = (Math.random() * 30 - 15) * (Math.PI / 180); // Random angle between -15 and 15 degrees
    return {
      id: Math.random(),
      x: direction === 1 ? -100 : window.innerWidth + 100, // Start off-screen
      y: Math.random() * (window.innerHeight * 0.15), // Top 15% of screen
      speedX: (0.5 + Math.random()) * direction * Math.cos(angle), // Horizontal component of speed
      speedY: (0.5 + Math.random()) * Math.sin(angle), // Vertical component of speed
      scale: 0.25 + Math.random() * 0.5, // Random size
      angle: angle, // Store the angle for rotation
    };
  };

  // Initialize birds
  useEffect(() => {
    // Start with 1 bird group
    setBirds(Array(1).fill(null).map(createBird));

    const animate = () => {
      setBirds(currentBirds => {
        // Move existing birds
        const updatedBirds = currentBirds.map(bird => ({
          ...bird,
          x: bird.x + bird.speedX,
          y: bird.y + bird.speedY,
        }));

        // Remove birds that are off screen
        const remainingBirds = updatedBirds.filter(bird => {
          // Use much wider boundaries to ensure birds completely exit the screen
          const farOffscreenX = 300; // Give 300px buffer beyond screen edges
          const farOffscreenY = 200; // Give 200px buffer for vertical movement
          
          return bird.x > -farOffscreenX && 
                 bird.x < window.innerWidth + farOffscreenX && 
                 bird.y > -farOffscreenY && 
                 bird.y < window.innerHeight * 0.3 + farOffscreenY;
        });

        // Add new birds if needed
        while (remainingBirds.length < 5) {
          remainingBirds.push(createBird());
        }

        return remainingBirds;
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '40%',
      overflow: 'hidden',
      pointerEvents: 'none', // Allow clicks to pass through
    }}>
      {birds.map(bird => (
        <img
          key={bird.id}
          src={birdsImage}
          alt=""
          style={{
            position: 'absolute',
            left: `${bird.x}px`,
            top: `${bird.y}px`,
            transform: `scale(${bird.scale}) scaleX(${bird.speedX > 0 ? 1 : -1}) rotate(${bird.angle * (180/Math.PI)}deg)`, 
            transition: 'transform 0.2s',
          }}
        />
      ))}
    </div>
  );
};

// Modify DifficultySelector to include Birds and background music
const DifficultySelector = ({ onSelect, isMusicPlaying, toggleMusic }) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundImage: `url(${raceTimerBackground})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      {/* Add the stopwatch image here */}
      <img 
        src={stopwatchImage} 
        alt="Stopwatch 1" 
        style={{
          position: 'absolute',
          top: '40%', // Center vertically
          right: '70%',
          transform: 'translateY(-50%) rotate(10deg) scaleX(-1)', // Adjust for centering, rotate, and flip
          zIndex: 1, // Set higher zIndex to be in front of birds
          width: '300px', // Adjust size as needed
          opacity: 1.0, // Optional: make it slightly transparent
          animation: 'rotateWatch1 6s ease-in-out infinite'
        }} 
      />
      <img 
        src={stopwatchImage} 
        alt="Stopwatch 2" 
        style={{
          position: 'absolute',
          top: '40%', // Center vertically
          left: '70%',
          transform: 'translateY(-50%) rotate(-10deg)', // Adjust for centering and rotate
          zIndex: 1, // Set higher zIndex to be in front of birds
          width: '300px', // Adjust size as needed
          opacity: 1.0, // Optional: make it slightly transparent
          animation: 'rotateWatch2 6s ease-in-out infinite'
        }} 
      />
      <h1 style={{
        fontFamily: 'FingerPaint, sans-serif',
        color: 'purple',
        fontSize: '145px',
        marginBottom: '0px',
        fontWeight: 'bold',
        textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
        position: 'relative',
        zIndex: 2, // Ensure it's above the stopwatch images
      }}>
        <span style={{ 
          marginRight: '10px',
          display: 'inline-block',
          animation: 'breathing 6s ease-in-out infinite'
        }}>RACETIMER</span>
        
      </h1>
      
      {/* Add the breathing animation keyframes */}
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes breathing {
            0% { transform: scale(1); }
            50% { transform: scale(1.02); }
            100% { transform: scale(1); }
          }
          
          @keyframes rotateWatch1 {
            0% { transform: translateY(-50%) rotate(7deg) scaleX(-1); }
            50% { transform: translateY(-50%) rotate(5deg) xscaleX(-1); }
            100% { transform: translateY(-50%) rotate(7deg) scaleX(-1); }
          }
          
          @keyframes rotateWatch2 {
            0% { transform: translateY(-50%) rotate(-7deg); }
            50% { transform: translateY(-50%) rotate(-5deg); }
            100% { transform: translateY(-50%) rotate(-7deg); }
          }
        `
      }} />
      
      <div style={{
        display: 'flex',
        gap: '20px',
        position: 'relative',
        zIndex: 1,
      }}>
        {Object.entries(DIFFICULTY_SETTINGS).map(([level, settings]) => (
          <button
            key={level}
            onClick={() => onSelect(level)}
            style={{
              padding: '20px 40px',
              fontSize: '24px',
              backgroundColor: level === 'easy' ? '#4CAF50' : 
                             level === 'medium' ? '#FF9800' : '#f44336',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              fontWeight: 'bold',
            }}
          >
            {level}
            <div style={{ fontSize: '14px', marginTop: '10px' }}>
              {settings.runners} Runners • {settings.laps} Laps • {Math.floor(settings.duration / 60)}min
            </div>
          </button>
        ))}
      </div>
      <Birds />
      {/* Move the music control button here */}
      <div style={{
        position: 'absolute',
        bottom: '20%', // Adjust as needed for spacing
        display: 'flex',
        justifyContent: 'center',
        width: '100%',
      }}>
        <button 
          onClick={toggleMusic}
          style={{
            padding: '8px 20px',
            fontSize: '16px',
            backgroundColor: isMusicPlaying ? '#f44336' : '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          {isMusicPlaying ? '❚❚ Stop Music' : '♫ Play Music'}
        </button>
      </div>
      {/* Add signature span */}
      <span style={{
        position: 'absolute',
        top: '10px',
        paddingRight: '10px',
        right: '10px',
        color: 'purple',
        fontFamily: 'Arial, sans-serif',
        fontSize: '24px',
        fontStyle: 'italic',
        fontWeight: 'bold'
      }}>
        by Scottie Mitchell
      </span>
    </div>
  );
};

// Modify the OverlayContent component to handle the time's up scenario
const OverlayContent = ({ gameStatus, badSplits, handleReset, handleContinue }) => {
  const renderIncompleteContent = () => (
    <>
      <h1 style={{
        color: '#f44336',
        fontSize: '48px',
        marginBottom: '20px',
      }}>
        Race Incomplete
      </h1>
      <p style={{ color: 'white', fontSize: '24px', marginBottom: '20px' }}>
        Correct {badSplits} Bad split{badSplits > 1 ? 's' : ''}
      </p>
      <button 
        onClick={handleContinue}
        style={{
          padding: '15px 30px',
          fontSize: '20px',
          backgroundColor: '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          cursor: 'pointer',
        }}
      >
        Continue
      </button>
    </>
  );

  const renderGameOverContent = () => {
    // Check if the game is lost (time ran out)
    if (gameStatus === 'lost') {
      return (
        <>
          <h1 style={{
            color: '#f44336',
            fontSize: '48px',
            marginBottom: '20px',
          }}>
            TIME'S UP!
          </h1>
          <p style={{ color: 'white', fontSize: '24px', marginBottom: '20px' }}>
            Game Over, better luck next time!
          </p>
          <button 
            onClick={handleReset}
            style={{
              padding: '15px 30px',
              fontSize: '20px',
              backgroundColor: '#2196F3',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              cursor: 'pointer',
            }}
          >
            Play Again
          </button>
        </>
      );
    }
    
    // For win state
    return (
      <>
        <h1 style={{
          color: '#4CAF50',
          fontSize: '48px',
          marginBottom: '20px',
        }}>
          YOU WIN!
        </h1>
        <p style={{ color: 'white', fontSize: '24px', marginBottom: '20px' }}>
          Congratulations, you have timed the race accurately!
        </p>
        <button 
          onClick={handleReset}
          style={{
            padding: '15px 30px',
            fontSize: '20px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
          }}
        >
          Play Again
        </button>
      </>
    );
  };

  return gameStatus === 'incomplete' ? renderIncompleteContent() : renderGameOverContent();
};

// Simplify the GameOverlay component
const GameOverlay = ({ gameStatus, isGameOver, badSplits, handleReset, handleContinue }) => {
  console.log("GameOverlay render: ", {gameStatus, isGameOver});
  
  if (!isGameOver) {
    console.log("Game not over, not showing overlay");
    return null;
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      <OverlayContent 
        gameStatus={gameStatus}
        badSplits={badSplits}
        handleReset={handleReset}
        handleContinue={handleContinue}
      />
    </div>
  );
};

const PhotoFinishSystem = () => {
  // Add audio ref and state at the PhotoFinishSystem level
  const menuMusicRef = useRef(null);  // Rename to menuMusicRef for clarity
  const gameMusicRef = useRef(null);  // Add new ref for game music
  const pistolSoundRef = useRef(null);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  
  // Add difficulty state
  const [difficulty, setDifficulty] = useState(null);
  
  // Rest of the existing state declarations
  const [currentTime, setCurrentTime] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTime, setSelectedTime] = useState(null);
  const [isEnteringBib, setIsEnteringBib] = useState(false);
  const [currentBibInput, setCurrentBibInput] = useState('');
  const [splits, setSplits] = useState([]);
  const [selectedRunner, setSelectedRunner] = useState(null);
  const [deletedSplits, setDeletedSplits] = useState(new Set());
  const [photoFinishScroll, setPhotoFinishScroll] = useState(0);
  const [isPhotoFinishHovered, setIsPhotoFinishHovered] = useState(false);
  const [gameTime, setGameTime] = useState(GAME_DURATION);
  const [totalLaps, setTotalLaps] = useState(TOTAL_LAPS);
  const [runners, setRunners] = useState([]);
  // Add state for cursor Y position
  const [cursorY, setCursorY] = useState(null);
  const [isGameOver, setIsGameOver] = useState(false);
  const [gameStatus, setGameStatus] = useState('waiting');
  const [goodSplits, setGoodSplits] = useState(0);
  const [badSplits, setBadSplits] = useState(0);
  // Add a flag to temporarily disable incomplete checks after pressing Continue
  const [checkIncomplete, setCheckIncomplete] = useState(true);

  // Add all the missing refs
  const bibInputRef = useRef(null);
  const liveViewCanvasRef = useRef(null);
  const photoFinishCanvasRef = useRef(null);
  const finishImageRef = useRef([]);
  const timeSlicesRef = useRef([]);
  const animationFrameRef = useRef(null);
  const runnerCrossingsRef = useRef({});

  // Add a ref to track total required splits based on difficulty
  const totalRequiredSplitsRef = useRef(0);

  // Replace the hardcoded constant with a state variable
  const [requiredSplitsPerRunner, setRequiredSplitsPerRunner] = useState(0);

  // Add this ref with the other refs in PhotoFinishSystem
  const runningSoundRef = useRef(null);

  // Add a direct way to check the game status after each split
  const checkAndHandleGameCompletion = useCallback((timeUp = false) => {
    console.log("Checking game status...");
    console.log(`Good splits: ${goodSplits}, Total required: ${totalRequiredSplitsRef.current}`);
    console.log(`Each runner needs: ${requiredSplitsPerRunner} splits`);
    
    // Get actual number of valid splits
    const validSplits = splits.filter(split => !deletedSplits.has(split.id) && split.isAccurate).length;
    console.log(`Valid splits (not deleted and accurate): ${validSplits}`);
    
    // Check if all runners have all their required splits
    const runnerSplitCounts = {};
    runners.forEach(runner => {
      runnerSplitCounts[runner.number] = 0;
    });
    
    splits.forEach(split => {
      if (!deletedSplits.has(split.id)) {
        runnerSplitCounts[split.bibNumber] = (runnerSplitCounts[split.bibNumber] || 0) + 1;
      }
    });
    
    const allRunnersFinished = runners.every(runner => {
      const count = runnerSplitCounts[runner.number] || 0;
      const finished = count >= requiredSplitsPerRunner;
      console.log(`Runner ${runner.number} has ${count}/${requiredSplitsPerRunner} splits`);
      return finished;
    });
    
    console.log(`All runners finished: ${allRunnersFinished}, Bad splits: ${badSplits}`);
    
    // WIN condition: All runners have all splits AND all splits are good
    if (allRunnersFinished && validSplits === totalRequiredSplitsRef.current) {
      console.log("VICTORY! All splits are good and every runner has all required splits");
      setGameStatus('won');
      setIsGameOver(true);
      setIsPlaying(false);
    }
    // INCOMPLETE condition: All runners have all splits BUT some splits are bad
    // Only check for incomplete if checkIncomplete flag is true
    else if (allRunnersFinished && badSplits > 0 && checkIncomplete) {
      console.log("Race incomplete: Some splits are bad");
      setGameStatus('incomplete');
      setIsGameOver(true);
      setIsPlaying(false);
    }
    // TIME UP condition
    else if (timeUp) {
      console.log("Time's up, game lost");
      setGameStatus('lost');
      setIsGameOver(true);
      setIsPlaying(false);
    }
  }, [runners, splits, deletedSplits, badSplits, goodSplits, requiredSplitsPerRunner, checkIncomplete]);

  // Update handleDeleteSplit to reassess neighboring splits
  const handleDeleteSplit = (splitId) => {
    // Find the split being deleted
    const splitToDelete = splits.find(split => split.id === splitId);
    
    if (!splitToDelete) return;
    
    // First, update counters based on the split being deleted
    if (splitToDelete.isAccurate) {
      setGoodSplits(prev => prev - 1);
    } else {
      setBadSplits(prev => prev - 1);
    }

    // Save the bibNumber and time for reassessment
    const { bibNumber } = splitToDelete;

    // Mark the split as deleted
    setDeletedSplits(prev => {
      const next = new Set(prev);
      next.add(splitId);
      return next;
    });

    // Find other splits for the same runner that might need reassessment
    const otherSplitsForRunner = splits.filter(split => 
      split.bibNumber === bibNumber && 
      split.id !== splitId && 
      !deletedSplits.has(split.id) &&
      split.isDuplicate === true
    );

    // If we found duplicate splits that need reassessment
    if (otherSplitsForRunner.length > 0) {
      // For each duplicate split, check if it's now valid
      otherSplitsForRunner.forEach(split => {
        // Check if it's still a duplicate with any remaining split
        const stillDuplicate = splits.some(otherSplit => 
          otherSplit.bibNumber === bibNumber &&
          otherSplit.id !== split.id &&
          otherSplit.id !== splitId &&
          !deletedSplits.has(otherSplit.id) &&
          Math.abs(otherSplit.time - split.time) < 3
        );

        // If it's no longer a duplicate, check if it matches a runner crossing
        if (!stillDuplicate) {
          const runnerCrossings = runnerCrossingsRef.current[bibNumber] || [];
          const isNowGoodSplit = runnerCrossings.some(
            crossingTime => Math.abs(crossingTime - split.time) <= 0.5
          );

          // If it's now a good split, update counters and the split object
          if (isNowGoodSplit) {
            console.log(`Split ${split.id} for runner ${bibNumber} is now valid after deleting conflicting split`);
            
            // Update counters (decrease bad, increase good)
            setBadSplits(prev => prev - 1);
            setGoodSplits(prev => prev + 1);
            
            // Update the split object to mark it as accurate
            setSplits(prev => prev.map(s => 
              s.id === split.id 
                ? { ...s, isAccurate: true, isDuplicate: false } 
                : s
            ));
          }
        }
      });
    }

    // Focus and select the bib input
    setTimeout(() => {
      if (bibInputRef.current) {
        bibInputRef.current.focus();
        bibInputRef.current.select();
      }
    }, 0);
    
    // Check game status in case this deletion resolves a win condition
    setTimeout(() => {
      checkAndHandleGameCompletion();
    }, 0);
  };

  const handleRunnerSelect = (runnerNumber) => {
    setSelectedRunner(prev => prev === runnerNumber ? null : runnerNumber);
  };

  useEffect(() => {
    if (isPlaying) {
      const animate = () => {
        setCurrentTime(time => {
          // Update splits for each runner
          runners.forEach(runner => {
            const pos = runner.getPosition(time);
            const currentSplit = Math.floor(pos.totalDistance / 25);
            const lastRecordedSplit = runner.splits.length;
            
            if (currentSplit > lastRecordedSplit) {
              runner.splits.push(time);
            }
          });

          // Check if all runners have completed their laps AND moved past the finish line
          const allRunnersFinished = runners.every(runner => {
            const pos = runner.getPosition(time);
            return pos.lap > totalLaps && pos.x <= FINISH_LINE_X; // Changed from >= to > to ensure complete final lap
          });

          // Add more extra recording time after all runners finish
          if (allRunnersFinished && time > finishImageRef.current.length * 2) { // Changed from 0.5 to 2
            setIsPlaying(false);
            return time;
          }
          return time + 0.5;
        });
        animationFrameRef.current = requestAnimationFrame(animate);
      };
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [isPlaying, runners, totalLaps]);

  const drawClock = (ctx, time) => {
    ctx.font = '12px arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(formatTime(time), 35, 15);
  };

  // Add back canvas initialization without auto-start
  useEffect(() => {
    if (liveViewCanvasRef.current && photoFinishCanvasRef.current) {
      const liveCtx = liveViewCanvasRef.current.getContext('2d');
      const photoCtx = photoFinishCanvasRef.current.getContext('2d');
      
      liveCtx.canvas.width = CANVAS_WIDTH;
      liveCtx.canvas.height = CANVAS_HEIGHT;
      photoCtx.canvas.width = CANVAS_WIDTH;
      photoCtx.canvas.height = CANVAS_HEIGHT;
      
      // Initialize with black background
      liveCtx.fillStyle = '#1a1a1a';
      liveCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      photoCtx.fillStyle = '#1a1a1a';
      photoCtx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }, []);

  // Fix the duplicate split handling to avoid double-counting bad splits
  const handleSplitCreate = (e) => {
    e.preventDefault();
    const bibNumber = parseInt(currentBibInput);
    
    if (bibNumber && selectedTime !== null) {
      // Re-enable incomplete checking when a new split is created
      setCheckIncomplete(true);
      
      // Check if runner has splits remaining
      const runnerSplits = splits.filter(
        split => split.bibNumber === bibNumber && !deletedSplits.has(split.id)
      ).length;

      if (runnerSplits >= requiredSplitsPerRunner) {
        // Alert the user that no splits are remaining
        alert(`No splits remaining for runner ${bibNumber}`);
        setCurrentBibInput('');
        if (bibInputRef.current) {
          bibInputRef.current.focus();
          bibInputRef.current.select();
        }
        return;
      }

      // First check if this split is too close to an existing split for this runner
      const existingSplitsForRunner = splits.filter(
        split => split.bibNumber === bibNumber && !deletedSplits.has(split.id)
      );

      const isDuplicateSplit = existingSplitsForRunner.some(
        split => Math.abs(split.time - selectedTime) < 3
      );

      if (isDuplicateSplit) {
        console.log(`Split at ${selectedTime} is too close to an existing split for runner ${bibNumber}`);
        // Add a duplicate split (marked as bad)
        const newSplit = { 
          id: Date.now(),
          time: selectedTime, 
          bibNumber,
          isAccurate: false, // Force to false because it's a duplicate
          isDuplicate: true  // Add a flag so we can show a different message
        };
        
        // Add to splits
        setSplits(prev => [...prev, newSplit]);
        
        // Update bad splits counter (only once)
        setBadSplits(prev => prev + 1);
        
        setCurrentBibInput('');
        
        if (bibInputRef.current) {
          bibInputRef.current.focus();
          bibInputRef.current.select();
        }
        
        // Check game status
        setTimeout(() => {
          checkAndHandleGameCompletion();
        }, 0);
        
        return; // Return early to prevent double-counting
      }

      // If not a duplicate, continue with normal accuracy check
      const runnerCrossings = runnerCrossingsRef.current[bibNumber] || [];
      const isGoodSplit = runnerCrossings.some(
        crossingTime => Math.abs(crossingTime - selectedTime) <= 1.0
      );

      // Update split counters
      if (isGoodSplit) {
        setGoodSplits(prev => prev + 1);
      } else {
        setBadSplits(prev => prev + 1);
      }

      // Add the split with accuracy information
      setSplits(prev => [...prev, { 
        id: Date.now(),
        time: selectedTime, 
        bibNumber,
        isAccurate: isGoodSplit
      }]);
      
      setCurrentBibInput('');
      
      // Check game status after adding split
      setTimeout(() => {
        checkAndHandleGameCompletion();
      }, 0);

      if (bibInputRef.current) {
        bibInputRef.current.focus();
        bibInputRef.current.select();
      }
    }
  };

  // Also add a useEffect to check for game completion whenever relevant state changes
  useEffect(() => {
    // Only check when we have some splits and the game is in progress
    if (splits.length > 0 && gameStatus === 'playing' && !isGameOver) {
      checkAndHandleGameCompletion();
    }
  }, [splits, deletedSplits, goodSplits, badSplits, checkAndHandleGameCompletion, gameStatus, isGameOver]);

  const drawSplits = useCallback((ctx) => {
    // First, collect and group splits by time
    const splitsByTime = {};
    splits
      .filter(split => {
        // Only include splits that were valid when created
        const splitsBeforeThis = splits
          .filter(s => 
            s.bibNumber === split.bibNumber && 
            !deletedSplits.has(s.id) &&
            s.id < split.id
          ).length;
        return !deletedSplits.has(split.id) && splitsBeforeThis < totalLaps;
      })
      .forEach(split => {
        const sliceIndex = timeSlicesRef.current.findIndex(t => t >= split.time);
        if (sliceIndex >= 0) {
          const time = timeSlicesRef.current[sliceIndex];
          if (!splitsByTime[time]) {
            splitsByTime[time] = [];
          }
          const runner = runners.find(r => r.number === split.bibNumber);
          splitsByTime[time].push({
            ...split,
            sliceIndex,
            x: sliceIndex * SLICE_WIDTH,
            color: runner.color
          });
        }
      });

    // Draw splits, handling multiple splits at the same time
    Object.entries(splitsByTime).forEach(([time, timeSplits]) => {
      // Sort splits at the same time by bib number
      timeSplits.sort((a, b) => a.bibNumber - b.bibNumber);

      // Draw the vertical line once for each time
      const x = timeSplits[0].x;
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = '#00A3FF';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CANVAS_HEIGHT);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw bib numbers with proper vertical spacing
      timeSplits.forEach((split, index) => {
        const bibText = `${split.bibNumber}`;
        ctx.font = 'bold 10px arial';
        //ctx.fontWeight = 'bold';
        ctx.fillStyle = split.color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Position each label with proper spacing
        const y = 10 + (index * 15); // 20px spacing between labels
        ctx.fillText(bibText, x-5, y);
      });
    });
  }, [splits, deletedSplits, runners, totalLaps]);

  const handlePhotoFinishScroll = (e) => {
    e.preventDefault();
    // Make scrolling more responsive by using deltaX for trackpad horizontal scroll
    const scrollAmount = e.deltaX !== 0 ? e.deltaX : e.deltaY > 0 ? 20 : -20;
    
    // Use the actual recorded data length instead of a fixed calculation
    const totalWidth = finishImageRef.current.length * SLICE_WIDTH;
    const maxScroll = Math.max(0, totalWidth - CANVAS_WIDTH);
    
    setPhotoFinishScroll(prev => Math.max(0, Math.min(maxScroll, prev + scrollAmount)));
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      console.log('Key pressed:', e.key);
      console.log('Current selected time:', selectedTime);
      
      if (!selectedTime && selectedTime !== 0) return;

      let newTime;
      if (e.key === 'ArrowLeft') {
        newTime = Math.max(0, selectedTime - 0.25); // Move by 0.25 seconds
      } 
      else if (e.key === 'ArrowRight') {
        // Find the maximum time available
        const maxTime = timeSlicesRef.current.length ? 
          timeSlicesRef.current[timeSlicesRef.current.length - 1] : 
          currentTime;
        
        newTime = Math.min(maxTime, selectedTime + 0.25);
      }
      else {
          return;
      }

      if (newTime !== undefined && Math.abs(newTime - selectedTime) > 0.001) {
        console.log('Setting new time:', newTime);
      setSelectedTime(newTime);
      setDisplayTime(newTime);
      setIsEnteringBib(true);

        // Focus and select the bib input
      setTimeout(() => {
        if (bibInputRef.current) {
          bibInputRef.current.focus();
          bibInputRef.current.select();
        }
      }, 0);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedTime, currentTime]);

  const handlePhotoFinishClick = (e) => {
    if (!photoFinishCanvasRef.current) return;
    
    const rect = photoFinishCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Scale the y coordinate to match canvas coordinates
    const normalizedY = (y / rect.height) * CANVAS_HEIGHT;
    setCursorY(normalizedY);
    
    const normalizedX = (x / rect.width) * CANVAS_WIDTH + photoFinishScroll;
    const sliceIndex = Math.floor(normalizedX / SLICE_WIDTH);
    
    if (sliceIndex >= 0 && sliceIndex < timeSlicesRef.current.length) {
      const clickedTime = timeSlicesRef.current[sliceIndex];
      setSelectedTime(clickedTime);
      setDisplayTime(clickedTime);
      setIsEnteringBib(true);

      // Focus and select the bib input
      setTimeout(() => {
      if (bibInputRef.current) {
        bibInputRef.current.focus();
        bibInputRef.current.select();
      }
      }, 0);
    }
  };

  const handleReset = () => {
    setCurrentTime(0);
    setDisplayTime(0);
    finishImageRef.current = [];
    timeSlicesRef.current = [];
    setIsPlaying(false);
    setSelectedTime(null);
    setIsEnteringBib(false);
    setCurrentBibInput('');
    setSplits([]);
    setDifficulty(null);
    setGameStatus('waiting');
    setIsGameOver(false);
    setGoodSplits(0);  // Reset good splits counter
    setBadSplits(0);   // Reset bad splits counter
    runnerCrossingsRef.current = {}; // Reset runner crossings
    totalRequiredSplitsRef.current = 0; // Reset total required splits
    setRequiredSplitsPerRunner(0);
    setCheckIncomplete(true); // Reset the check incomplete flag

    // Stop the running sound
    if (runningSoundRef.current) {
      runningSoundRef.current.pause();
      runningSoundRef.current.currentTime = 0;
      runningSoundRef.current.onended = null; // Clear any pending onended callbacks
    }

    // Adjust volume back to difficulty selection level
    if (menuMusicRef.current && isMusicPlaying) {
      menuMusicRef.current.volume = 0.7; // Restore to full volume
    }
  };

  // Update the handleContinue function to disable incomplete checks temporarily
  const handleContinue = () => {
    // Resume the game by changing game status and isGameOver
    setGameStatus('playing');
    setIsGameOver(false);
    setIsPlaying(true);
    // Disable incomplete check until next split is created
    setCheckIncomplete(false);
  };

  // Modify the drawLiveFrame function to keep photo finish collection intact
  useEffect(() => {
    if (!liveViewCanvasRef.current || !difficulty) return;
    
    const drawLiveFrame = () => {
      const ctx = liveViewCanvasRef.current.getContext('2d');
      if (!ctx) return;
      
      // Clear the canvas
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Background with lane markers
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      // Draw lane lines
      for (let i = 1; i < runners.length; i++) {
        ctx.strokeStyle = '#333333';
        ctx.beginPath();
        ctx.moveTo(0, i * CANVAS_HEIGHT / runners.length);
        ctx.lineTo(CANVAS_WIDTH, i * CANVAS_HEIGHT / runners.length);
        ctx.stroke();
      }
      
      // Draw checkerboard finish line BEFORE runners
      const finishX = FINISH_LINE_X * CANVAS_WIDTH / 100;
      const finishWidth = 20; // Width of finish line
      const squareHeight = 10; // Height of each checkerboard square
      
      // Draw the base white finish line 
      ctx.fillStyle = 'rgba(255, 255, 255, 1.0)'; // White
      ctx.fillRect(finishX - finishWidth/2, 0, finishWidth, CANVAS_HEIGHT);
      
      // Now overlay the checkerboard pattern 
      ctx.fillStyle = 'rgba(0, 0, 0, 0.25)'; // Black 
      for (let y = 0; y < CANVAS_HEIGHT; y += squareHeight * 2) {
        // Left square
        ctx.fillRect(
          finishX - finishWidth/2, 
          y, 
          finishWidth/2, 
          squareHeight
        );
        // Right square
        ctx.fillRect(
          finishX, 
          y + squareHeight, 
          finishWidth/2, 
          squareHeight
        );
      }
      
      // Time indicator AFTER finish line but BEFORE runners
      if (isPhotoFinishHovered) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fillRect(finishX - 10, 0, 20, CANVAS_HEIGHT);
      }
      
      // Use displayTime for visualization but currentTime for animation
      const timeToShow = selectedTime !== null ? displayTime : currentTime;
      drawClock(ctx, timeToShow);
      
      // Draw runners at their current animated positions LAST
      runners.forEach(runner => {
        // Always calculate position based on current time for animation
        const animatedPos = runner.getPosition(currentTime);
        // But use the display time position for rendering if a time is selected
        const displayPos = selectedTime !== null ? 
          runner.getPosition(displayTime) : 
          animatedPos;
        
        if (displayPos.lap < totalLaps) {
          // Use displayPos for visual rendering
          const x = displayPos.x * CANVAS_WIDTH / 100;
          const y = displayPos.y * CANVAS_HEIGHT / 100;
          
          // Draw bib number (above runner)
          const bibText = `${runner.number}`;
          ctx.font = `bold ${BIB_FONT_SIZE} arial`;
          ctx.fillStyle = BIB_TEXT_COLOR;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          const textY = y - RUNNER_SIZE;
          ctx.fillText(bibText, x, textY);
          
          // Draw runner circle
          ctx.beginPath();
          ctx.fillStyle = runner.color;
          ctx.arc(x, y, RUNNER_SIZE, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      
      // For photo finish data collection, ALWAYS use animatedPos
      if (isPlaying) {
        const sliceX = FINISH_LINE_X * CANVAS_WIDTH / 100;
        
        // Clear the slice area and redraw only the runners at their animated positions
        const tempCtx = document.createElement('canvas').getContext('2d');
        tempCtx.canvas.width = SLICE_WIDTH;
        tempCtx.canvas.height = CANVAS_HEIGHT;
        
        // Draw white background for the slice
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, SLICE_WIDTH, CANVAS_HEIGHT);
        
        // Draw lane lines
        for (let i = 1; i < runners.length; i++) {
          tempCtx.strokeStyle = '#e0e0e0';
          tempCtx.beginPath();
          tempCtx.moveTo(0, i * CANVAS_HEIGHT / runners.length);
          tempCtx.lineTo(SLICE_WIDTH, i * CANVAS_HEIGHT / runners.length);
          tempCtx.stroke();
        }
        
        // Draw runners at their animated positions in the slice
        runners.forEach(runner => {
          const animatedPos = runner.getPosition(currentTime);
          if (animatedPos.lap < totalLaps) {
            const x = animatedPos.x * CANVAS_WIDTH / 100;
            // Increase the capture window slightly
            if (Math.abs(x - sliceX) <= RUNNER_SIZE * 1.5) {  // Increased from RUNNER_SIZE to RUNNER_SIZE * 1.5
              const y = animatedPos.y * CANVAS_HEIGHT / 100;
              
              // Draw head (small circle above runner)
              tempCtx.beginPath();
              tempCtx.fillStyle = runner.color;
              // Make the head more visible
              tempCtx.arc(SLICE_WIDTH, y - RUNNER_SIZE - 3, RUNNER_SIZE * 0.7, 0, Math.PI * 2);
              tempCtx.fill();
              
              // Draw runner body as a rectangle instead of circle
              tempCtx.fillStyle = runner.color;
              // Explicitly draw a rectangle for the body
              tempCtx.fillRect(
                SLICE_WIDTH/2 - RUNNER_SIZE/2, 
                y - RUNNER_SIZE/2, 
                RUNNER_SIZE *1.5, 
                RUNNER_SIZE * 6
              );
              
              /*Draw left leg (vertical line) - make it more visible
              tempCtx.beginPath();
              tempCtx.strokeStyle = runner.color;
              tempCtx.lineWidth = 4; // Thicker line
              tempCtx.moveTo(SLICE_WIDTH/2 - RUNNER_SIZE/2, y + RUNNER_SIZE/2);
              tempCtx.lineTo(SLICE_WIDTH/2 - RUNNER_SIZE/2, y + RUNNER_SIZE * 2.5);
              tempCtx.stroke();
              
              // Draw right leg (vertical line) - make it more visible
              tempCtx.beginPath();
              tempCtx.strokeStyle = runner.color;
              tempCtx.lineWidth = 4; // Thicker line
              tempCtx.moveTo(SLICE_WIDTH/2 + RUNNER_SIZE/2, y + RUNNER_SIZE/2);
              tempCtx.lineTo(SLICE_WIDTH/2 + RUNNER_SIZE/2, y + RUNNER_SIZE * 2.5);
              tempCtx.stroke();

              /* Add bib number in the center of the runner
              tempCtx.font = 'bold 10px monospace';
              tempCtx.fillStyle = '#000000';
              tempCtx.textAlign = 'center';
              tempCtx.textBaseline = 'middle';
              tempCtx.fillText(runner.number.toString(), SLICE_WIDTH/2, y);
              */
              // Record crossing time with debouncing
              if (!runnerCrossingsRef.current[runner.number]) {
                runnerCrossingsRef.current[runner.number] = [];
              }
              const lastCrossing = runnerCrossingsRef.current[runner.number][runnerCrossingsRef.current[runner.number].length - 1];
              // Only record if it's been at least 1 second since the last crossing
              if (!lastCrossing || currentTime - lastCrossing > 1) {
                runnerCrossingsRef.current[runner.number].push(currentTime);
              }
            }
          }
        });
        
        // Capture the slice for photo finish
        const imageData = tempCtx.getImageData(0, 0, SLICE_WIDTH, CANVAS_HEIGHT);
        finishImageRef.current.push(imageData);
        timeSlicesRef.current.push(currentTime);
      }
    };
    
    const animate = () => {
      drawLiveFrame();
      animationId = requestAnimationFrame(animate);
    };
    
    let animationId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationId);
  }, [currentTime, isPlaying, isPhotoFinishHovered, displayTime, selectedTime, runners, totalLaps, difficulty]);

  // Modify the photo finish effect to only run when difficulty is selected
  useEffect(() => {
    const drawPhotoFinish = () => {
      if (!photoFinishCanvasRef.current || !difficulty) return;
      const ctx = photoFinishCanvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Apply scroll offset when drawing slices
      finishImageRef.current.forEach((slice, index) => {
        const x = index * SLICE_WIDTH - photoFinishScroll;
        if (x >= -SLICE_WIDTH && x <= CANVAS_WIDTH) { // Only draw visible slices
          ctx.putImageData(slice, x, 0);
        }
      });

      // Adjust split markers for scroll
      ctx.save();
      ctx.translate(-photoFinishScroll, 0);
      drawSplits(ctx);
      ctx.restore();

      // Draw timeline for selected time
      if (selectedTime !== null) {
        const selectedIndex = timeSlicesRef.current.findIndex(t => t >= selectedTime);
        if (selectedIndex >= 0) {
          const x = selectedIndex * SLICE_WIDTH - photoFinishScroll;
          if (x >= -SLICE_WIDTH && x <= CANVAS_WIDTH) {
            drawTimeLine(ctx, selectedIndex, selectedTime, photoFinishScroll, cursorY);
          }
        }
      }
    };

    drawPhotoFinish();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, selectedTime, splits, drawSplits, photoFinishScroll, difficulty, cursorY]);

  // Fix the game timer effect to properly handle time running out
  useEffect(() => {
    if (!difficulty || !isPlaying || gameStatus !== 'playing') return;
    
    if (gameTime > 0) {
      const timer = setInterval(() => {
        setGameTime(prev => {
          const newTime = prev - 1;
          if (newTime <= 0) {
            // Directly set game over state when time runs out
            setGameStatus('lost');
            setIsGameOver(true);
            setIsPlaying(false);
            clearInterval(timer); // Ensure timer stops
            return 0;
          }
          return newTime;
        });
      }, 1000);
      
      return () => clearInterval(timer);
    } else if (gameTime <= 0) {
      // Backup check in case the time is already at 0
      setGameStatus('lost');
      setIsGameOver(true);
      setIsPlaying(false);
    }
  }, [isPlaying, gameStatus, gameTime, difficulty]);

  // Fix the play/pause handler
  const handlePlayClick = () => {
    if (gameStatus === 'waiting') {
      setGameStatus('playing');
    }
    setIsPlaying(!isPlaying);
  };

  // Fix the PauseOverlay component
  const PauseOverlay = () => {
    if (isPlaying && gameStatus === 'playing') return null; // Inverted the condition

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 900,
      }}>
        <button 
          onClick={handlePlayClick}
          style={{
            padding: '15px 30px',
            fontSize: '24px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer'
          }}
        >
          {gameStatus === 'waiting' ? 'Start Game' : 'Resume'}
        </button>
      </div>
    );
  };

  // Fix the GameTimer component styling
  const GameTimer = () => {
    return (
      <div style={{
        position: 'fixed',
        top: '35px',
        left: '220px', // Moved 500px to the right
        fontSize: '18px',
        color: gameTime <= 10 ? '#f44336' : '#000000', // Changed to black
        fontWeight: 'bold',
        zIndex: 800,
        backgroundColor: 'rgba(255, 255, 255, 0.8)', // Add semi-transparent background
        padding: '5px 10px',
        borderRadius: '10px',
      }}>
        Time Left:  {Math.floor(gameTime / 60)}:{(gameTime % 60).toString().padStart(2, '0')}
      </div>
    );
  };

  // Add difficulty selection handler
  const handleDifficultySelect = (level) => {
    const settings = DIFFICULTY_SETTINGS[level];
    setDifficulty(level);
    setTotalLaps(settings.laps);
    setGameTime(settings.duration);
    const newRunners = createRunners(settings.runners);
    setRunners(newRunners);
    
    // Adjust audio volume when entering the game (don't stop it)
    if (menuMusicRef.current && isMusicPlaying) {
      menuMusicRef.current.volume = 0.15; // Reduce volume to 15%
    }
    
    // Play starter pistol sound at full volume
    if (pistolSoundRef.current) {
      pistolSoundRef.current.volume = 1.0; // Full volume
      pistolSoundRef.current.currentTime = 0; // Reset to start
      pistolSoundRef.current.play().catch(e => console.log("Pistol sound failed:", e));
    }
    
    // Better running sound implementation with error handling
    const playRunningSound = () => {
      console.log("Attempting to play running sound");
      if (runningSoundRef.current) {
        // Make sure any previous playback is stopped
        runningSoundRef.current.pause();
        runningSoundRef.current.currentTime = 0;
        
        // Remove previous event listeners
        runningSoundRef.current.onended = null;
        
        // Set volume and play
        runningSoundRef.current.volume = 0.07;
        
        // Log audio state
        console.log("Running sound readyState:", runningSoundRef.current.readyState);
        console.log("Running sound file:", runningSoundFile);
        
        runningSoundRef.current.play()
        .then(() => {
          console.log("Running sound started playing successfully");
          // Set up second play after first one ends
          runningSoundRef.current.onended = () => {
            console.log("First running sound ended, playing second time");
            runningSoundRef.current.currentTime = 0;
            runningSoundRef.current.play()
            .then(() => console.log("Running sound second play started"))
            .catch(e => console.log("Running sound second play failed:", e));
            // Clear after second play
            runningSoundRef.current.onended = null;
          };
        })
        .catch(e => {
          console.log("Running sound failed to play:", e);
          // Try again with user interaction
          console.log("Scheduling retry for running sound...");
        });
      } else {
        console.log("Running sound ref is not available");
      }
    };
    
    // Play with a slight delay to ensure audio context is ready
    setTimeout(playRunningSound, 500);
    
    // Set the required splits per runner based on the difficulty's lap count
    setRequiredSplitsPerRunner(settings.laps);
    
    // Calculate and store total required splits
    const totalRequired = settings.runners * settings.laps;
    totalRequiredSplitsRef.current = totalRequired;
    
    setGameStatus('playing');
    setIsPlaying(true);
  };

  // Add the SplitAccuracyTracker component
  const SplitAccuracyTracker = ({ goodSplits, badSplits }) => {
    return (
      <div style={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        padding: '10px',
        borderRadius: '10px',
        color: 'white',
        fontWeight: 'bold',
        zIndex: 1000,
        fontSize: '24px'
      }}>
        <div style={{ color: '#4CAF50' }}>Good Splits: {goodSplits}</div>
        <div style={{ color: '#f44336' }}>Bad Splits: {badSplits}</div>
      </div>
    );
  };

  // Add track field cosmetic styling to the photo finish and live camera sections
  const photoFinishSection = {
    height: '45.5%',
    background: 'linear-gradient(to bottom, #1a1a1a, #2c2c2c)',
    borderRadius: '8px',
    padding: '2px',
    border: '3px solid #e63946', // Track red border
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
  };

  const liveCameraSection = {
    height: '45.5%',
    background: 'linear-gradient(to bottom, #1a1a1a, #2c2c2c)',
    borderRadius: '8px',
    padding: '2px',
    border: '3px solid #457b9d', // Blue border for live view
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
  };

  const sectionHeader = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 15px',
    borderBottom: '2px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '5px 5px 0 0'
  };

  const canvasStyle = {
    width: '100%',
    height: 'calc(100% - 48px)',
    background: 'linear-gradient(#242424, #1a1a1a)',
    borderRadius: '0 0 4px 4px',
    border: '1px solid rgba(255,255,255,0.05)'
  };

  // Add back the drawTimeLine function that was accidentally removed
  const drawTimeLine = (ctx, sliceIndex, time, scrollOffset, cursorY = null) => {
    // Draw vertical red line
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sliceIndex * SLICE_WIDTH - scrollOffset, 0);
    ctx.lineTo(sliceIndex * SLICE_WIDTH - scrollOffset, CANVAS_HEIGHT);
    ctx.stroke();
    
    // Draw horizontal crosshair dash if cursor position is available
    if (cursorY !== null) {
      const x = sliceIndex * SLICE_WIDTH - scrollOffset;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 6, cursorY);
      ctx.lineTo(x + 6, cursorY);
      ctx.stroke();
    }
    
    // Draw time label above
    ctx.font = '12px arial';
    ctx.fillStyle = 'black';
    const timeText = formatTime(time);
    const textWidth = ctx.measureText(timeText).width;
    const x = Math.min(Math.max(sliceIndex * SLICE_WIDTH - scrollOffset - textWidth / 2, 10), CANVAS_WIDTH - textWidth - 10);
    ctx.fillText(timeText, x-30, 10);
  };

  // Add a new state to track if music is explicitly turned off by user
  const [userToggledOff, setUserToggledOff] = useState(false);

  // Modify the toggleMusic function to handle both audio tracks
  const toggleMusic = () => {
    if (isMusicPlaying) {
      // Stop both audio tracks
      if (menuMusicRef.current) menuMusicRef.current.pause();
      if (gameMusicRef.current) gameMusicRef.current.pause();
      setIsMusicPlaying(false);
      setUserToggledOff(true);
    } else {
      // Play the appropriate track based on current game state
      const activeAudio = difficulty ? gameMusicRef.current : menuMusicRef.current;
      if (activeAudio) {
        activeAudio.play()
          .then(() => {
            setIsMusicPlaying(true);
            setUserToggledOff(false);
            activeAudio.volume = difficulty ? 0.15 : 0.7;
          })
          .catch(error => console.log("Play failed:", error));
      }
    }
  };

  // Modify the useEffect for auto-play to handle both tracks
  useEffect(() => {
    const menuAudio = menuMusicRef.current;
    const gameAudio = gameMusicRef.current;
    
    const attemptPlay = () => {
      if (!userToggledOff && isMusicPlaying) {
        const activeAudio = difficulty ? gameAudio : menuAudio;
        const inactiveAudio = difficulty ? menuAudio : gameAudio;
        
        if (activeAudio && inactiveAudio) {
          // Stop the inactive track
          inactiveAudio.pause();
          inactiveAudio.currentTime = 0;
          
          // Play the active track
          activeAudio.volume = difficulty ? 0.15 : 0.7;
          const playPromise = activeAudio.play();
          
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log(`${difficulty ? 'Game' : 'Menu'} music started successfully`);
              })
              .catch(error => {
                console.log("Autoplay was prevented:", error);
              });
          }
        }
      }
    };

    // Try to play immediately when component mounts or difficulty changes
    attemptPlay();
    
    // Add user interaction listener to help with autoplay policies
    const handleUserInteraction = () => {
      if (!isMusicPlaying && !userToggledOff) {
        attemptPlay();
        // Remove event listeners after first interaction
        document.removeEventListener('click', handleUserInteraction);
        document.removeEventListener('keydown', handleUserInteraction);
      }
    };
    
    // Add event listeners for user interaction
    document.addEventListener('click', handleUserInteraction);
    document.addEventListener('keydown', handleUserInteraction);
    
    return () => {
      // Clean up event listeners
      document.removeEventListener('click', handleUserInteraction);
      document.removeEventListener('keydown', handleUserInteraction);
    };
  }, [isMusicPlaying, userToggledOff, difficulty]); // Add difficulty to dependencies

  // Fix the effect with the ESLint warning and add more logging for audio debugging
  useEffect(() => {
    // Capture ref value inside effect to use in cleanup
    const runningSoundElement = runningSoundRef.current;
    
    console.log("Running sound effect triggered. Difficulty:", difficulty);
    console.log("Running sound element exists:", !!runningSoundElement);
    
    // If difficulty changes to null (going back to selection screen), stop running sound
    if (difficulty === null && runningSoundElement) {
      console.log("Stopping running sound - returned to difficulty screen");
      runningSoundElement.pause();
      runningSoundElement.currentTime = 0;
      runningSoundElement.onended = null;
    }
    
    // Cleanup function
    return () => {
      if (runningSoundElement) {
        console.log("Cleanup: stopping running sound");
        runningSoundElement.pause();
        runningSoundElement.currentTime = 0;
        runningSoundElement.onended = null;
      }
    };
  }, [difficulty]);

  // Add state for drag functionality
  const [isDraggingTimeLine, setIsDraggingTimeLine] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [dragStartX, setDragStartX] = useState(null);
  // eslint-disable-next-line no-unused-vars
  const [initialSelectedTime, setInitialSelectedTime] = useState(null);

  // Add mouse down handler for the timeline
  const handlePhotoFinishMouseDown = (e) => {
    if (!photoFinishCanvasRef.current || selectedTime === null) return;
    
    // Start dragging immediately when clicking anywhere on the photo finish canvas
    // if a time is already selected
    setIsDraggingTimeLine(true);
    
    // Also update the time immediately on mousedown to the position clicked
    const rect = photoFinishCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Scale the y coordinate to match canvas coordinates
    const normalizedY = (y / rect.height) * CANVAS_HEIGHT;
    setCursorY(normalizedY);
    
    const normalizedX = (x / rect.width) * CANVAS_WIDTH + photoFinishScroll;
    const sliceIndex = Math.floor(normalizedX / SLICE_WIDTH);
    
    if (sliceIndex >= 0 && sliceIndex < timeSlicesRef.current.length) {
      const newTime = timeSlicesRef.current[sliceIndex];
      setSelectedTime(newTime);
      setDisplayTime(newTime);
    }
    
    // Prevent default browser behavior that might interfere with dragging
    e.preventDefault();
  };

  // Add mouse move handler for timeline dragging
  const handlePhotoFinishMouseMove = (e) => {
    if (!isDraggingTimeLine || !photoFinishCanvasRef.current) return;
    
    const rect = photoFinishCanvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Scale the y coordinate to match canvas coordinates
    const normalizedY = (y / rect.height) * CANVAS_HEIGHT;
    setCursorY(normalizedY);
    
    const normalizedX = (x / rect.width) * CANVAS_WIDTH + photoFinishScroll;
    // eslint-disable-next-line no-unused-vars
    const sliceIndex = Math.floor(normalizedX / SLICE_WIDTH);
    
    // Directly set time based on current mouse position
    if (sliceIndex >= 0 && sliceIndex < timeSlicesRef.current.length) {
      const newTime = timeSlicesRef.current[sliceIndex];
      setSelectedTime(newTime);
      setDisplayTime(newTime);
    }
    
    e.preventDefault();
  };

  // Add mouse up handler to end dragging
  const handlePhotoFinishMouseUp = (e) => {
    if (isDraggingTimeLine) {
      setIsDraggingTimeLine(false);
      
      // Focus and select the bib input
      setTimeout(() => {
        if (bibInputRef.current) {
          bibInputRef.current.focus();
          bibInputRef.current.select();
        }
      }, 0);
    }
  };

  // Add mouse leave handler to end dragging when mouse leaves the canvas
  const handlePhotoFinishMouseLeave = (e) => {
    if (isDraggingTimeLine) {
      setIsDraggingTimeLine(false);
    }
  };

  return (
    <div className="main-container">
      {/* Update audio elements */}
      <audio 
        ref={menuMusicRef}
        src={bgMusic}
        loop={true}
        preload="auto"
      />
      <audio 
        ref={gameMusicRef}
        src={countdownMusic}
        loop={true}
        preload="auto"
      />
      <audio 
        ref={pistolSoundRef}
        src={starterPistolSound}
        preload="auto"
      />
      <audio 
        ref={runningSoundRef}
        src={runningSoundFile}
        preload="auto"
      />
      
      {!difficulty && 
        <DifficultySelector 
          onSelect={handleDifficultySelect} 
          isMusicPlaying={isMusicPlaying}
          toggleMusic={toggleMusic}
        />
      }
      <GameOverlay 
        gameStatus={gameStatus} 
        isGameOver={isGameOver} 
        badSplits={badSplits} 
        handleReset={handleReset}
        handleContinue={handleContinue}
      />
      <PauseOverlay />
      <GameTimer />
      {difficulty && <SplitAccuracyTracker goodSplits={goodSplits} badSplits={badSplits} />}
      {/* Left side - Results table */}
      <div className="table-view">
        <ResultsTable 
          runners={runners} 
          splits={splits} 
          onDeleteSplit={handleDeleteSplit}
          selectedRunner={selectedRunner}
          onRunnerSelect={handleRunnerSelect}
          deletedSplits={deletedSplits}
          totalLaps={totalLaps}
        />
      </div>

      {/* Right side - Photo finish and Live view */}
      <div className="right-section">
        <div style={photoFinishSection}>
          <div style={sectionHeader}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#ffffff', 
                        textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
              <span style={{ color: '#e63946' }}>●</span> PHOTO FINISH IMAGE
            </h3>
            <div style={{ color: gameTime <= 10 ? '#f44336' : 'white', fontWeight: 'bold' }}>
              Time Left: {Math.floor(gameTime / 60)}:{(gameTime % 60).toString().padStart(2, '0')}
            </div>
            {isEnteringBib && (
              <form onSubmit={handleSplitCreate}>
                <input
                  ref={bibInputRef}
                  type="number"
                  value={currentBibInput}
                  onChange={(e) => setCurrentBibInput(e.target.value)}
                  placeholder="Enter Bib #"
                  min="1"
                  max={runners.length}
                  autoFocus
                  style={{ 
                    background: '#ffffff', 
                    border: '2px solid #e63946',
                    borderRadius: '10px',
                    padding: '5px 10px',
                    color: '#000000',
                    fontWeight: 'bold',
                    width: '60px',
                  }}
                />
                <button type="submit" style={{ 
                  background: '#e63946', 
                  border: 'none',
                  color: 'white',
                  padding: '5px 10px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}>Mark Split</button>
              </form>
            )}
            <div className="button-group">
              <button onClick={handlePlayClick} style={{ 
                background: isPlaying ? '#f77f00' : '#4CAF50',
                border: 'none',
                borderRadius: '10px',
                padding: '5px 15px',
                color: 'white',
                fontWeight: 'bold'
              }}>
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button onClick={handleReset} style={{ 
                background: '#457b9d',
                border: 'none',
                borderRadius: '10px',
                padding: '5px 15px',
                color: 'white',
                fontWeight: 'bold'
              }}>Reset</button>
            </div>
          </div>
          <canvas 
            ref={photoFinishCanvasRef}
            style={canvasStyle}
            onClick={handlePhotoFinishClick}
            onWheel={handlePhotoFinishScroll}
            onMouseEnter={() => setIsPhotoFinishHovered(true)}
            onMouseLeave={handlePhotoFinishMouseLeave}
            onMouseDown={handlePhotoFinishMouseDown}
            onMouseMove={handlePhotoFinishMouseMove}
            onMouseUp={handlePhotoFinishMouseUp}
          />
        </div>

        <div style={liveCameraSection}>
          <div style={sectionHeader}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold', color: '#ffffff',
                        textShadow: '1px 1px 2px rgba(0,0,0,0.7)' }}>
              <span style={{ color: '#457b9d' }}>●</span> OVERHEAD VIEW
            </h3>
          </div>
          <canvas 
            ref={liveViewCanvasRef}
            style={canvasStyle}
          />
        </div>
      </div>
    </div>
  );
};

export default PhotoFinishSystem;